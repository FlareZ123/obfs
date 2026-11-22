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
      code:'import state from "./state.mjs";console.log("left",state.secretField);'},
    {path:'right.mjs',sourceType:'module',
      code:'import state from "./state.mjs";console.log("right",state.secretField);'},
    {path:'main.mjs',sourceType:'module',
      code:'import "./left.mjs";import "./right.mjs";'}
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


test('direct default owner preserves local alias and imported identity flow',async()=>{
  /** @type {ModuleFile[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',code:'export default {secretField:23};'},
    {path:'identity.mjs',sourceType:'module',code:'export const identity=x=>x;'},
    {path:'main.mjs',sourceType:'module',code:[
      'import state from "./state.mjs";',
      'import {identity} from "./identity.mjs";',
      'const first=state;',
      'const second=identity(first);',
      'console.log(second.secretField);'
    ].join('\n')}
  ];
  await compileAndCompare(files,1);
});

test('opaque imported consumer of direct default owner declines renaming',async()=>{
  /** @type {ModuleFile[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',code:'export default {secretField:23};'},
    {path:'sink.mjs',sourceType:'module',
      code:'export function inspect(value){return Object.keys(value)[0];}'},
    {path:'main.mjs',sourceType:'module',code:[
      'import state from "./state.mjs";',
      'import {inspect} from "./sink.mjs";',
      'console.log(inspect(state),state.secretField);'
    ].join('\n')}
  ];
  await compileAndCompare(files,0);
});


test('direct default owner supports an earlier immutable key export',async()=>{
  /** @type {ModuleFile[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',
      code:'export const KEY="secretField";export default {secretField:29};'},
    {path:'main.mjs',sourceType:'module',
      code:'import state,{KEY} from "./state.mjs";console.log(state[KEY]);'}
  ];
  await compileAndCompare(files,1);
});

test('acyclic default owner supports a verified immutable key from another module',async()=>{
  /** @type {ModuleFile[]} */
  const files=[
    {path:'key.mjs',sourceType:'module',code:'export const KEY="secretField";'},
    {path:'state.mjs',sourceType:'module',code:'export default {secretField:37};'},
    {path:'main.mjs',sourceType:'module',code:[
      'import {KEY} from "./key.mjs";',
      'import state from "./state.mjs";',
      'console.log(state[KEY]);'
    ].join('\n')}
  ];
  await compileAndCompare(files,1);
});

test('acyclic default owner proves a later immutable same-producer key',async()=>{
  /** @type {ModuleFile[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',
      code:'export default {secretField:43};export const KEY="secretField";'},
    {path:'main.mjs',sourceType:'module',
      code:'import state,{KEY} from "./state.mjs";console.log(state[KEY]);'}
  ];
  await compileAndCompare(files,1);
});

test('cyclic default owner refuses a late key that is initially in TDZ',async()=>{
  /** @type {ModuleFile[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',
      code:'import {probe} from "./main.mjs";export default {secretField:43};'+
        'try{console.log(probe());}catch(error){console.log(error.name);}'+
        'export const KEY="secretField";console.log("ready",probe());'},
    {path:'main.mjs',sourceType:'module',
      code:'import state,{KEY} from "./state.mjs";'+
        'export function probe(){return state[KEY];}'}
  ];
  await compileAndCompare(files,0);
});


test('anonymous default IIFE object factory retains cross-file field proof',async()=>{
  /** @type {ModuleFile[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',
      code:'export default (()=>({secretField:53}))();'},
    {path:'main.mjs',sourceType:'module',
      code:'import state from "./state.mjs";console.log(state.secretField);'}
  ];
  await compileAndCompare(files,1);
});

test('single-use named default object factory retains cross-file field proof',async()=>{
  /** @type {ModuleFile[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',code:[
      'function make(){return {secretField:59};}',
      'export default make();'
    ].join('\n')},
    {path:'main.mjs',sourceType:'module',
      code:'import state from "./state.mjs";console.log(state.secretField);'}
  ];
  await compileAndCompare(files,1);
});

test('effectful default object factory remains outside the proof',async()=>{
  /** @type {ModuleFile[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',code:[
      'function make(){console.log("build");return {secretField:61};}',
      'export default make();'
    ].join('\n')},
    {path:'main.mjs',sourceType:'module',
      code:'import state from "./state.mjs";console.log(state.secretField);'}
  ];
  await compileAndCompare(files,0);
});
