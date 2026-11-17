'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {normalizeDistributedFiles}=require('../sims/attacker-token-normalize');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'module',code:string}} Module */

/**
 * Run an actual native ESM graph with distinct fresh module URLs.
 * @param {Module[]} files
 * @returns {Promise<string>}
 */
async function execute(files) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-normalizer-destructure-'));
  try {
    for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
    const child=spawnSync(process.execPath,[path.join(root,'entry.mjs')],{
      encoding:'utf8',timeout:8000
    });
    assert.equal(child.status,0,child.stderr);
    return child.stdout.trim();
  } finally {
    await fs.rm(root,{recursive:true,force:true});
  }
}

for(const scenario of [
  {
    name:'assignment-expression object destructuring',
    seed:'cross-file-assignment',
    expected:'17,5',
    files:[
      {path:'state.mjs',sourceType:'module',code:
        'export const shared={privateField:17,otherField:5};'},
      {path:'entry.mjs',sourceType:'module',code:
        'import {shared} from "./state.mjs";let captured=0;'+
        '({privateField:captured}=shared);'+
        'const displayed=[captured,shared.otherField];'+
        'console.log(displayed.join(","));'}
    ]
  },
  {
    name:'declaration-pattern factory object destructuring',
    seed:'factory-heldout-grid/positive/2/factory-0/consumer-2',
    expected:'44',
    files:[
      {path:'state.mjs',sourceType:'module',code:
        'function make2(){return {private2First:17,private2Second:27};}'+
        'export const shared=make2();'},
      {path:'entry.mjs',sourceType:'module',code:
        'import {shared} from "./state.mjs";'+
        'const {private2First:first,private2Second:second}=shared;'+
        'console.log(first+second);'}
    ]
  }
]) {
  test('source-only token normalizer preserves owner/consumer keys: '+scenario.name,
    async()=>{
      const files=/** @type {Module[]} */ (scenario.files);
      const transformed=obfuscateFiles(files,{
        mode:'coo',closedWorld:true,seed:scenario.seed,
        strings:false,identifiers:false
      });
      assert.equal(transformed.crossFile.properties,2);
      const emitted=/** @type {Module[]} */ (transformed.files);
      assert.equal(await execute(files),scenario.expected);
      assert.equal(await execute(emitted),scenario.expected);
      const attacked=normalizeDistributedFiles(emitted);
      assert.equal(attacked.properties,2);
      const normalized=/** @type {Module[]} */ (attacked.files);
      const observed=await execute(normalized);
      assert.equal(observed,scenario.expected,
        JSON.stringify({scenario:scenario.name,emitted,normalized},null,2));
    });
}
