'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {obfuscateFiles} = require('../src');
const {atomicWrite} = require('../src/atomic');

/** @typedef {{path:string,code:string,sourceType:'module'}} ModuleInput */
/**
 * Compare the observable output and exit status of original and obfuscated
 * ESM module graphs. Run the real Node ESM linker, rather than mocking imports.
 * @param {ModuleInput[]} files
 * @param {{closedWorld:boolean}} options
 * @returns {Promise<ReturnType<typeof obfuscateFiles>>}
 */
async function compareModules(files, options) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'obfs-export-alias-'));
  try {
    /** @param {ModuleInput[]|ReturnType<typeof obfuscateFiles>['files']} sources */
    async function run(sources) {
      for (const file of sources) await atomicWrite(path.join(dir,file.path),file.code);
      const result = spawnSync(process.execPath,[path.join(dir,'main.mjs')],{encoding:'utf8'});
      return {status:result.status,stdout:result.stdout,stderr:result.stderr};
    }
    const original = await run(files);
    assert.equal(original.status,0,original.stderr);
    const transformed = obfuscateFiles(files,{mode:'coo',seed:'exported-alias-regression',...options});
    const output = await run(transformed.files);
    assert.equal(output.status,original.status,output.stderr);
    assert.equal(output.stdout,original.stdout);
    return transformed;
  } finally {
    await fs.rm(dir,{recursive:true,force:true});
  }
}

test('normal mode preserves properties exposed by an exported const alias',async()=>{
  const result=await compareModules([
    {path:'state.mjs',sourceType:'module',code:'const internal={secretField:31};export const publicAlias=internal;export const result=internal.secretField;'},
    {path:'main.mjs',sourceType:'module',code:'import {publicAlias,result} from "./state.mjs";console.log(result,publicAlias.secretField,Object.keys(publicAlias).join(","));'}
  ],{closedWorld:false});
  assert.equal(result.files.find(f=>f.path==='state.mjs').metrics.objects,0);
});

test('closed-world proof refuses an additional exported alias of its exported root',async()=>{
  const result=await compareModules([
    {path:'state.mjs',sourceType:'module',code:'export const state={secretField:41};export const secondAlias=state;'},
    {path:'main.mjs',sourceType:'module',code:'import {state,secondAlias} from "./state.mjs";console.log(state.secretField,secondAlias.secretField,Object.keys(secondAlias).join(","));'}
  ],{closedWorld:true});
  assert.equal(result.crossFile.properties,0);
});

test('closed-world importer cannot re-export an alias without a complete proof',async()=>{
  const result=await compareModules([
    {path:'state.mjs',sourceType:'module',code:'export const state={secretField:51};'},
    {path:'relay.mjs',sourceType:'module',code:'import {state} from "./state.mjs";export const forwarded=state;'},
    {path:'main.mjs',sourceType:'module',code:'import {forwarded} from "./relay.mjs";console.log(forwarded.secretField,Object.keys(forwarded).join(","));'}
  ],{closedWorld:true});
  assert.equal(result.crossFile.properties,0);
});

test('closed-world exporter refuses aliases returned by identity functions',async()=>{
  const result=await compareModules([
    {path:'state.mjs',sourceType:'module',code:'export const state={secretField:61};function id(p){return p}export const forwarded=id(state);'},
    {path:'main.mjs',sourceType:'module',code:'import {forwarded} from "./state.mjs";console.log(forwarded.secretField,Object.keys(forwarded).join(","));'}
  ],{closedWorld:true});
  assert.equal(result.crossFile.properties,0);
});

test('direct closed-world export without escaped aliases remains transformable',async()=>{
  const result=await compareModules([
    {path:'state.mjs',sourceType:'module',code:'export const state={secretField:71};'},
    {path:'main.mjs',sourceType:'module',code:'import {state} from "./state.mjs";console.log(state.secretField);'}
  ],{closedWorld:true});
  assert.equal(result.crossFile.properties,1);
});
