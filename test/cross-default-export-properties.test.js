'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'module',code:string}} ModuleFile */

/**
 * @param {ReadonlyArray<{path:string,code:string|Buffer}>} files
 * @param {string} entry
 * @returns {Promise<string>}
 */
async function execute(files,entry='main.mjs'){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-default-export-properties-'));
  try{
    for(const file of files)await atomicWrite(path.join(dir,file.path),file.code);
    const child=spawnSync(process.execPath,[path.join(dir,entry)],{
      encoding:'utf8',
      timeout:15000
    });
    if(child.error)throw child.error;
    assert.equal(child.status,0,child.stderr);
    return child.stdout;
  }finally{
    await fs.rm(dir,{recursive:true,force:true});
  }
}

/**
 * @param {ModuleFile[]} files
 * @param {number} expectedProperties
 * @returns {Promise<ReturnType<typeof obfuscateFiles>>}
 */
async function compileAndCompare(files,expectedProperties){
  const native=await execute(files);
  const compiled=obfuscateFiles(files,{
    mode:'coo',
    closedWorld:true,
    seed:'direct-default-export-properties',
    strings:false,
    identifiers:false,
    properties:true
  });
  assert.equal(compiled.crossFile.properties,expectedProperties);
  assert.equal(await execute(compiled.files),native);
  return compiled;
}

test('closed-world ESM renames direct anonymous default-export object fields',async()=>{
  /** @type {ModuleFile[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',
      code:'export default {secretField:41,otherField:1};'},
    {path:'main.mjs',sourceType:'module',
      code:'import state from "./state.mjs";console.log(state.secretField+state.otherField);'}
  ];
  const compiled=await compileAndCompare(files,2);
  const owner=compiled.files.find(file=>file.path==='state.mjs');
  const main=compiled.files.find(file=>file.path==='main.mjs');
  assert.equal(typeof owner?.code,'string');
  assert.equal(typeof main?.code,'string');
  assert.doesNotMatch(/** @type {string} */(owner.code),/secretField|otherField/);
  assert.doesNotMatch(/** @type {string} */(main.code),/secretField|otherField/);
});

test('closed-world ESM accepts named default import specifier syntax',async()=>{
  /** @type {ModuleFile[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',code:'export default {secretField:7};'},
    {path:'main.mjs',sourceType:'module',
      code:'import {default as state} from "./state.mjs";console.log(state.secretField);'}
  ];
  await compileAndCompare(files,1);
});

test('closed-world ESM rewrites every direct default importer',async()=>{
  /** @type {ModuleFile[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',code:'export default {secretField:17};'},
    {path:'left.mjs',sourceType:'module',
      code:'import state from "./state.mjs";export const left=state.secretField+1;'},
    {path:'right.mjs',sourceType:'module',
      code:'import state from "./state.mjs";export const right=state.secretField+2;'},
    {path:'main.mjs',sourceType:'module',
      code:'import {left} from "./left.mjs";import {right} from "./right.mjs";console.log(left+right);'}
  ];
  await compileAndCompare(files,1);
});

test('namespace access to anonymous default owner conservatively declines renaming',async()=>{
  /** @type {ModuleFile[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',code:'export default {secretField:31};'},
    {path:'main.mjs',sourceType:'module',
      code:'import * as ns from "./state.mjs";console.log(Object.keys(ns.default),ns.default.secretField);'}
  ];
  await compileAndCompare(files,0);
});

test('source reexport of anonymous default owner conservatively declines renaming',async()=>{
  /** @type {ModuleFile[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',code:'export default {secretField:31};'},
    {path:'relay.mjs',sourceType:'module',
      code:'export {default as state} from "./state.mjs";'},
    {path:'main.mjs',sourceType:'module',
      code:'import {state} from "./relay.mjs";console.log(Object.keys(state),state.secretField);'}
  ];
  await compileAndCompare(files,0);
});

test('shape observation through direct default import declines renaming',async()=>{
  /** @type {ModuleFile[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',code:'export default {secretField:31};'},
    {path:'main.mjs',sourceType:'module',
      code:'import state from "./state.mjs";console.log(Object.keys(state),state.secretField);'}
  ];
  await compileAndCompare(files,0);
});
