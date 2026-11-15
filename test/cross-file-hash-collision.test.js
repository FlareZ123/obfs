'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {obfuscateFiles} = require('../src');
const {atomicWrite} = require('../src/atomic');

/** @typedef {{path:string,code:string,sourceType:'module'}} ModuleFile */
/** @param {ModuleFile[]} files @returns {Promise<string>} */
async function evaluate(files) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-cross-hash-'));
  try {
    for(const file of files) await atomicWrite(path.join(root,file.path),file.code);
    const run=spawnSync(process.execPath,[path.join(root,'main.mjs')],{
      encoding:'utf8',timeout:5000
    });
    assert.equal(run.status,0,run.stderr);
    return run.stdout;
  } finally {
    await fs.rm(root,{force:true,recursive:true});
  }
}

test('a 48-bit shortened SHA-256 collision cannot merge cross-file ESM object fields',async()=>{
  // sha256('cross-collision/state.mjs/state/p787915') and the corresponding
  // p3853476 input share the 48-bit prefix 2c3f50efcbd4.
  const files=[
    {path:'state.mjs',sourceType:'module',code:'export const state={p787915:13,p3853476:29};'},
    {path:'main.mjs',sourceType:'module',
      code:'import {state} from "./state.mjs";console.log([state.p787915,state.p3853476].join(","));'}
  ];
  const original=await evaluate(files);
  assert.equal(original,'13,29\n');
  const result=obfuscateFiles(files,{mode:'coo',seed:'cross-collision',
    closedWorld:true,strings:false,identifiers:false});
  assert.equal(await evaluate(result.files),original);
  assert.equal(result.crossFile.objects,0);
  assert.equal(result.crossFile.properties,0);
});

test('noncolliding cross-file properties remain transformable',async()=>{
  const files=[
    {path:'state.mjs',sourceType:'module',code:'export const state={p787915:13,anotherField:29};'},
    {path:'main.mjs',sourceType:'module',
      code:'import {state} from "./state.mjs";console.log([state.p787915,state.anotherField].join(","));'}
  ];
  const original=await evaluate(files);
  const result=obfuscateFiles(files,{mode:'coo',seed:'cross-collision',
    closedWorld:true,strings:false,identifiers:false});
  assert.equal(result.crossFile.objects,1);
  assert.equal(result.crossFile.properties,2);
  assert.equal(await evaluate(result.files),original);
});
