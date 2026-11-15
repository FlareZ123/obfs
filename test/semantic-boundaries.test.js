'use strict';

const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {obfuscateFiles} = require('../src');
const {atomicWrite} = require('../src/atomic');

/** @typedef {{path:string,code:string,sourceType:'module'}} ESMFile */

/**
 * Evaluate the original and obfuscated import cycle using Node's ESM linker.
 * A module's dependencies execute before its own top-level decoder setup.
 * @param {ESMFile[]} files
 * @returns {Promise<ReturnType<typeof obfuscateFiles>>}
 */
async function compareCycle(files) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-esm-cycle-'));
  try {
    /** @param {ESMFile[]|ReturnType<typeof obfuscateFiles>['files']} sources */
    async function execute(sources) {
      for(const f of sources) await atomicWrite(path.join(dir,f.path),f.code);
      return spawnSync(process.execPath,[path.join(dir,'a.mjs')],{encoding:'utf8'});
    }
    const original=await execute(files);
    assert.equal(original.status,0,original.stderr);
    const result=obfuscateFiles(files,{
      mode:'coo',seed:'esm-cycle-hoisting',properties:false,identifiers:false
    });
    const modified=await execute(result.files);
    assert.equal(modified.status,0,modified.stderr);
    assert.equal(modified.stdout,original.stdout);
    assert.equal(modified.stderr,original.stderr);
    return result;
  } finally {
    await fs.rm(dir,{recursive:true,force:true});
  }
}

test('hoisted exported function called inside ESM cycle preserves its literal',async()=>{
  const result=await compareCycle([
    {path:'a.mjs',sourceType:'module',code:`import './b.mjs';export function get(){return 'cyclic-module-literal';}`},
    {path:'b.mjs',sourceType:'module',code:`import {get} from './a.mjs';console.log(get());`}
  ]);
  assert.equal(result.files[0].metrics.literals,0);
});

test('hoisted function default parameter also executes before module initializer',async()=>{
  const result=await compareCycle([
    {path:'a.mjs',sourceType:'module',code:`import './b.mjs';export function get(v='default-before-initialization'){return v;}`},
    {path:'b.mjs',sourceType:'module',code:`import {get} from './a.mjs';console.log(get());`}
  ]);
  assert.equal(result.files[0].metrics.literals,0);
});

test('ESM function literals remain transformable without eager dependencies',()=>{
  const file={path:'standalone.mjs',sourceType:'module',code:`export function get(){return 'safe-module-literal';}`};
  const result=obfuscateFiles([file],{
    mode:'coo',seed:'esm-cycle-no-deps',properties:false,identifiers:false
  });
  assert.equal(result.files[0].metrics.literals,1);
});

test('properties:false disables local and closed-world ESM property transformations',()=>{
  /** @type {ESMFile[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',code:'export const state={secretField:42};'},
    {path:'entry.mjs',sourceType:'module',code:`import {state} from './state.mjs';export const answer=state.secretField;`}
  ];
  const result=obfuscateFiles(files,{
    mode:'coo',seed:'disabled-properties',closedWorld:true,
    properties:false,identifiers:false,strings:false
  });
  assert.equal(result.crossFile.objects,0);
  assert.equal(result.crossFile.properties,0);
  assert.deepEqual(result.files.map(f=>f.code),files.map(f=>f.code));
});
