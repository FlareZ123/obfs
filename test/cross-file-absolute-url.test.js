'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {spawnSync} = require('node:child_process');
const {obfuscateFiles} = require('../src');
const {atomicWrite} = require('../src/atomic');

/** @typedef {{path:string,sourceType:'module',code:string}} SourceFile */

test('closed-world property proof must recognize untracked absolute ESM file URL consumers',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-absolute-url-'));
  try {
    const sourceURL=pathToFileURL(path.join(dir,'state.mjs')).href;
    /** @type {SourceFile[]} */
    const files=[
      {path:'state.mjs',sourceType:'module',code:'export const state={secretValue:31};'},
      {path:'main.mjs',sourceType:'module',
        code:`import {state} from ${JSON.stringify(sourceURL)};console.log(state.secretValue);`}
    ];
    /** @param {SourceFile[]|ReturnType<typeof obfuscateFiles>['files']} sourceFiles */
    async function run(sourceFiles) {
      for(const file of sourceFiles) await atomicWrite(path.join(dir,file.path),file.code);
      const proc=spawnSync(process.execPath,[path.join(dir,'main.mjs')],{
        encoding:'utf8',timeout:5000
      });
      assert.equal(proc.status,0,proc.stderr);
      return proc.stdout;
    }
    const expected=await run(files);
    assert.equal(expected,'31\n');
    const output=obfuscateFiles(files,{
      mode:'coo',closedWorld:true,strings:false,identifiers:false,seed:'absolute-esm-path'
    });
    assert.equal(output.crossFile.properties,0,'An untracked absolute import must defeat the closed-world proof');
    assert.equal(await run(output.files),expected);
  } finally {
    await fs.rm(dir,{recursive:true,force:true});
  }
});

test('ordinary relative named imports remain transformable in closed-world mode',()=>{
  /** @type {SourceFile[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',code:'export const state={secretValue:31};'},
    {path:'main.mjs',sourceType:'module',code:'import {state} from "./state.mjs";console.log(state.secretValue);'}
  ];
  const output=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,strings:false,identifiers:false,seed:'absolute-esm-path'
  });
  assert.equal(output.crossFile.properties,1);
});

test('Node builtin module specifiers do not disable other relative import proofs',()=>{
  /** @type {SourceFile[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',code:'export const state={secretValue:31};'},
    {path:'main.mjs',sourceType:'module',
      code:'import assert from "node:assert/strict";import {state} from "./state.mjs";assert.equal(state.secretValue,31);'}
  ];
  const output=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,strings:false,identifiers:false,seed:'absolute-esm-path'
  });
  assert.equal(output.crossFile.properties,1);
});

test('bare package import is conservatively untracked by the current resolver',()=>{
  /** @type {SourceFile[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',code:'export const state={secretValue:31};'},
    {path:'main.mjs',sourceType:'module',
      code:'import {unrelated} from "package-self-reference";import {state} from "./state.mjs";console.log(unrelated,state.secretValue);'}
  ];
  const output=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,strings:false,identifiers:false,seed:'absolute-esm-path'
  });
  assert.equal(output.crossFile.properties,0);
});
