'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @type {{path:string,sourceType:'module',code:string}[]} */
const exporter=[{path:'state.mjs',sourceType:'module',code:'export const state={secretField:23};'}];

test('case-mismatched relative import declines closed-world property rewrite',()=>{
  const files=[...exporter,{path:'main.mjs',sourceType:'module',
    code:'import {state} from "./STATE.mjs";console.log(state.secretField);'}];
  const result=obfuscateFiles(files,{mode:'coo',closedWorld:true,seed:'case-alias',strings:false,identifiers:false});
  assert.equal(result.crossFile.properties,0);
  assert.deepEqual(result.files.map(f=>f.code),files.map(f=>f.code));
});

test('a missing relative dependency declines the declared closed-world proof',()=>{
  const files=[...exporter,{path:'main.mjs',sourceType:'module',
    code:'import "./unprovided.mjs";import {state} from "./state.mjs";console.log(state.secretField);'}];
  const result=obfuscateFiles(files,{mode:'coo',closedWorld:true,seed:'missing-module',strings:false,identifiers:false});
  assert.equal(result.crossFile.properties,0);
});

test('canonical supplied dependency still permits cross-file property rewriting',()=>{
  const files=[...exporter,{path:'main.mjs',sourceType:'module',
    code:'import {state} from "./state.mjs";console.log(state.secretField);'}];
  const result=obfuscateFiles(files,{mode:'coo',closedWorld:true,seed:'present-module',strings:false,identifiers:false});
  assert.equal(result.crossFile.properties,1);
});

test('case-mismatched ESM import runs equivalently on case-insensitive volumes',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-casefold-import-'));
  const files=[...exporter,{path:'main.mjs',sourceType:'module',
    code:'import {state} from "./STATE.mjs";console.log(state.secretField);'}];
  try {
    /** @param {typeof files|ReturnType<typeof obfuscateFiles>['files']} sources */
    async function run(sources) {
      for(const file of sources)await atomicWrite(path.join(dir,file.path),file.code);
      return spawnSync(process.execPath,[path.join(dir,'main.mjs')],{encoding:'utf8'});
    }
    const original=await run(files);
    if(original.status!==0){t.skip('Current filesystem has case-sensitive module resolution');return;}
    const output=obfuscateFiles(files,{mode:'coo',closedWorld:true,seed:'casefold-e2e',strings:false,identifiers:false});
    assert.equal(output.crossFile.properties,0);
    const obfuscated=await run(output.files);
    assert.equal(obfuscated.status,0,obfuscated.stderr);
    assert.equal(obfuscated.stdout,original.stdout);
  } finally {await fs.rm(dir,{recursive:true,force:true});}
});
