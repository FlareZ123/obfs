'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,code:string,sourceType:'module'}} ModuleInput */

/**
 * Compare real Node ESM executions of an exported object and its importer.
 * @param {string} importerBody
 * @param {number} expectedRenames
 * @returns {Promise<void>}
 */
async function check(importerBody,expectedRenames) {
  /** @type {ModuleInput[]} */
  const sources=[
    {path:'state.mjs',sourceType:'module',code:'export const state={secretField:42};'},
    {path:'main.mjs',sourceType:'module',code:`import {state} from './state.mjs';\n${importerBody}`}
  ];
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-cross-inherited-'));
  try {
    /** @param {ModuleInput[]|ReturnType<typeof obfuscateFiles>['files']} files */
    async function run(files) {
      for(const file of files) await atomicWrite(path.join(dir,file.path),file.code);
      return spawnSync(process.execPath,[path.join(dir,'main.mjs')],{encoding:'utf8'});
    }
    const original=await run(sources);
    assert.equal(original.status,0,original.stderr);
    const transformed=obfuscateFiles(sources,{
      mode:'coo',closedWorld:true,seed:'cross-inherited',
      identifiers:false,strings:false
    });
    const result=await run(transformed.files);
    assert.equal(result.status,0,result.stderr);
    assert.equal(result.stdout,original.stdout);
    assert.equal(transformed.crossFile.properties,expectedRenames);
  } finally {
    await fs.rm(dir,{recursive:true,force:true});
  }
}

test('closed-world ESM rejects getter on inherited field that enumerates own keys',async()=>{
  await check(`Object.defineProperty(Object.prototype,'inspect',{
    get(){return Object.keys(this)[0];}
  });console.log(state.inspect,state.secretField);`,0);
});

test('closed-world ESM refuses own-property deletion that exposes prototype value',async()=>{
  await check(`Object.prototype.secretField=91;
    delete state.secretField;
    console.log(state.secretField);`,0);
});

test('closed-world ESM can rename an own key that shadows an inherited getter',async()=>{
  await check(`Object.defineProperty(Object.prototype,'secretField',{get(){return 99;}});
    console.log(state.secretField);`,1);
});

test('closed-world ESM rejects destructuring of an inherited reflective getter',async()=>{
  await check(`Object.defineProperty(Object.prototype,'inspect',{
    get(){return Object.keys(this)[0];}
  });const {inspect}=state;console.log(inspect,state.secretField);`,0);
});
