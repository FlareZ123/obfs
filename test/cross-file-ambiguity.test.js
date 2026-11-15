'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {obfuscateFiles} = require('../src');
const {renameCrossFileProperties} = require('../src/cross-properties');
const {atomicWrite} = require('../src/atomic');

/** @typedef {{path:string,code:string,sourceType:'module'|'commonjs'}} Source */
/**
 * Exercise a real Node 22 ESM/CJS loader graph with the original and obfuscated
 * files. An ambiguous consumer must force closed-world property renaming off.
 * @param {Source[]} files
 * @param {string} entry
 * @returns {Promise<void>}
 */
async function compare(files,entry) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-url-ambiguity-'));
  try {
    /** @param {Source[]|ReturnType<typeof obfuscateFiles>['files']} source */
    async function run(source) {
      for(const file of source) await atomicWrite(path.join(dir,file.path),file.code);
      const processResult=spawnSync(process.execPath,[path.join(dir,entry)],{encoding:'utf8'});
      assert.equal(processResult.status,0,processResult.stderr);
      return processResult.stdout;
    }
    const expected=await run(files);
    const output=obfuscateFiles(files,{mode:'coo',closedWorld:true,seed:'url-ambiguity'});
    assert.equal(output.crossFile.properties,0);
    assert.equal(await run(output.files),expected);
  } finally {
    await fs.rm(dir,{recursive:true,force:true});
  }
}

test('query-suffixed static ESM importer is an ambiguous URL alias',async()=>{
  await compare([
    {path:'state.mjs',sourceType:'module',code:'export const state={secretField:11};'},
    {path:'main.mjs',sourceType:'module',code:'import {state} from "./state.mjs?view=1";console.log(state.secretField);'}
  ],'main.mjs');
});

test('fragment-suffixed static ESM importer is an ambiguous URL alias',async()=>{
  await compare([
    {path:'state.mjs',sourceType:'module',code:'export const state={secretField:12};'},
    {path:'main.mjs',sourceType:'module',code:'import {state} from "./state.mjs#view";console.log(state.secretField);'}
  ],'main.mjs');
});

test('percent-encoded static ESM importer can resolve to the same file',async()=>{
  await compare([
    {path:'state.mjs',sourceType:'module',code:'export const state={secretField:13};'},
    {path:'main.mjs',sourceType:'module',code:'import {state} from "./st%61te.mjs";console.log(state.secretField);'}
  ],'main.mjs');
});

test('CommonJS dynamic import is an untracked consumer of an ESM object',async()=>{
  await compare([
    {path:'state.mjs',sourceType:'module',code:'export const state={secretField:14};'},
    {path:'main.cjs',sourceType:'commonjs',code:'import("./state.mjs").then(({state})=>console.log(state.secretField));'}
  ],'main.cjs');
});

test('Node 22 CommonJS require can synchronously consume ESM namespace',async()=>{
  await compare([
    {path:'state.mjs',sourceType:'module',code:'export const state={secretField:15};'},
    {path:'main.cjs',sourceType:'commonjs',code:'const {state}=require("./state.mjs");console.log(state.secretField);'}
  ],'main.cjs');
});

test('untyped .mjs inputs are inferred in direct cross-file transforms',()=>{
  const inputs=[
    {path:'state.mjs',code:'export const state={secretField:16};'},
    {path:'main.mjs',code:'import {state} from "./state.mjs";console.log(state.secretField);'}
  ];
  const output=renameCrossFileProperties(inputs,'untyped-module');
  assert.equal(output.properties,1);
  assert.doesNotMatch(output.files[1].code,/\.secretField\b/);
});
