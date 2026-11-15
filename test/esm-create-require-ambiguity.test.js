'use strict';

const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {obfuscateFiles} = require('../src');
const {atomicWrite} = require('../src/atomic');

/**
 * Run the same two-file ESM application before and after closed-world
 * obfuscation. Every source group is complete from the bundler's perspective,
 * but Node's CommonJS interop can create an otherwise untracked consumer.
 * @param {string} entrySource
 * @param {number} expectedRenamedProperties
 * @returns {Promise<void>}
 */
async function compare(entrySource,expectedRenamedProperties) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-esm-require-'));
  const files=[
    {path:'state.mjs',sourceType:'module',code:'export const state={secretField:11};'},
    {path:'main.mjs',sourceType:'module',code:entrySource}
  ];
  try {
    /** @param {typeof files|ReturnType<typeof obfuscateFiles>['files']} sources */
    async function execute(sources) {
      for (const file of sources) await atomicWrite(path.join(dir,file.path),file.code);
      const result=spawnSync(process.execPath,[path.join(dir,'main.mjs')],{encoding:'utf8'});
      assert.equal(result.status,0,result.stderr);
      return result.stdout;
    }
    const original=await execute(files);
    const output=obfuscateFiles(files,{
      mode:'coo',seed:'esm-node-module-interop',closedWorld:true,
      strings:false,identifiers:false
    });
    assert.equal(output.crossFile.properties,expectedRenamedProperties);
    assert.equal(await execute(output.files),original);
  } finally {
    await fs.rm(dir,{recursive:true,force:true});
  }
}

test('node:module named createRequire is an untracked ESM consumer',async()=>{
  await compare("import {createRequire} from 'node:module'; const req=createRequire(import.meta.url); console.log(req('./state.mjs').state.secretField);",0);
});

test('node:module namespace createRequire is an untracked ESM consumer',async()=>{
  await compare("import * as moduleApi from 'node:module'; const req=moduleApi.createRequire(import.meta.url); console.log(req('./state.mjs').state.secretField);",0);
});

test('process.getBuiltinModule can acquire createRequire without static import',async()=>{
  await compare("const req=process.getBuiltinModule('module').createRequire(import.meta.url); console.log(req('./state.mjs').state.secretField);",0);
});

test('canonical static named ESM imports remain eligible',async()=>{
  await compare("import {state} from './state.mjs'; console.log(state.secretField);",1);
});
