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
 * @param {ModuleFile[]} files
 * @param {number} expectedProperties
 * @returns {Promise<void>}
 */
async function compare(files,expectedProperties) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-imported-key-'));
  /** @param {ModuleFile[]|ReturnType<typeof obfuscateFiles>['files']} set */
  async function run(set) {
    for(const file of set)await atomicWrite(path.join(root,file.path),file.code);
    const result=spawnSync(process.execPath,[path.join(root,'main.mjs')],{encoding:'utf8'});
    return {status:result.status,stdout:result.stdout,stderr:result.stderr};
  }
  try {
    const original=await run(files);
    const output=obfuscateFiles(files,{mode:'coo',seed:'imported-constant-key',
      closedWorld:true,strings:false,identifiers:false});
    assert.equal(output.crossFile.properties,expectedProperties,
      JSON.stringify(output.crossFile));
    assert.deepEqual(await run(output.files),original);
  } finally {await fs.rm(root,{force:true,recursive:true});}
}

/** @param {string} state @param {string} main @param {ModuleFile[]} [extra] @returns {ModuleFile[]} */
function graph(state,main,extra=[]) {
  return [
    {path:'state.mjs',sourceType:'module',code:state},
    ...extra,
    {path:'main.mjs',sourceType:'module',code:main}
  ];
}

for(const [name,state,main] of [
  ['direct imported immutable string',
    'export const key="secretField";export const bag={secretField:8};',
    'import {bag,key} from "./state.mjs";console.log(bag[key]);'],
  ['renamed bindings and unrelated global key contract',
    'export const key="secretField";export const bag={secretField:8};',
    'import {bag as table,key as property} from "./state.mjs";globalThis.secretField=25;'+
      'console.log(table[property],globalThis[property]);'],
  ['pure template initialized before exported object',
    'export const key=`secretField`;export const bag={secretField:8};',
    'import {bag,key} from "./state.mjs";console.log(bag?.[key]);'],
  ['constant string expression',
    'export const key="secret"+"Field";export const bag={secretField:8};',
    'import {bag,key} from "./state.mjs";console.log(bag[key]);'],
  ['same declaration sequential const initializers',
    'export const key="secretField",bag={secretField:8};',
    'import {bag,key} from "./state.mjs";console.log(bag[key]);']
]) {
  test('imported sibling key is proved against private owned object: '+name,
    async()=>compare(graph(state,main),1));
}

test('imported key and owner follow proven intermodule identity forwarding',async()=>{
  await compare(graph(
    'export const key="secretField";export const bag={secretField:8};',
    'import {bag,key} from "./state.mjs";import {identity} from "./identity.mjs";'+
      'const alias=identity(bag);console.log(alias[key]);',
    [{path:'identity.mjs',sourceType:'module',code:'export const identity=x=>x;'}]
  ),1);
});

test('acyclic ESM graph proves an immutable key exported from a third module',async()=>{
  await compare(graph(
    'export const bag={secretField:8};',
    'import {bag} from "./state.mjs";import {key} from "./key.mjs";console.log(bag[key]);',
    [{path:'key.mjs',sourceType:'module',code:'export const key="secretField";'}]
  ),1);
});


test('top-level immutable key exported through a named alias remains provable',async()=>{
  await compare(graph(
    'export const bag={secretField:8};',
    'import {bag} from "./state.mjs";import {lookupKey as property} from "./key.mjs";'+
      'console.log(bag[property]);',
    [{path:'key.mjs',sourceType:'module',
      code:'const internalKey="secretField";export {internalKey as lookupKey};'}]
  ),1);
});

test('top-level immutable key named export preserves separate alias spellings',async()=>{
  await compare(graph(
    'export const bag={secretField:8};',
    'import {bag} from "./state.mjs";import {publicKey} from "./key.mjs";'+
      'console.log(bag[publicKey]);',
    [{path:'key.mjs',sourceType:'module',
      code:'const internalKey="secret"+"Field";export {internalKey as publicKey};'}]
  ),1);
});

test('mutable named export cannot enter the immutable imported key proof',async()=>{
  await compare(graph(
    'export const bag={secretField:8};',
    'import {bag} from "./state.mjs";import {publicKey} from "./key.mjs";'+
      'console.log(bag[publicKey]);',
    [{path:'key.mjs',sourceType:'module',
      code:'let internalKey="secretField";export {internalKey as publicKey};'}]
  ),0);
});

test('shadowed name is conservatively excluded from named export key proof',async()=>{
  await compare(graph(
    'export const bag={secretField:8};',
    'import {bag} from "./state.mjs";import {publicKey} from "./key.mjs";'+
      'console.log(bag[publicKey]);',
    [{path:'key.mjs',sourceType:'module',
      code:'const internalKey="secretField";function shadow(){const internalKey="x";return internalKey;}'+
        'export {internalKey as publicKey};'}]
  ),0);
});

test('named export of toString key continues to preserve original function text',async()=>{
  await compare(graph(
    'export const bag={secretField:8};',
    'import {bag} from "./state.mjs";import {publicKey} from "./key.mjs";'+
      'function probe(){return bag.secretField;}console.log(probe[publicKey]());',
    [{path:'key.mjs',sourceType:'module',
      code:'const internalKey="toString";export {internalKey as publicKey};'}]
  ),0);
});

test('acyclic key proof survives a deferred top-level-await dependency',async()=>{
  await compare(graph(
    'export const bag={secretField:8};',
    'import {bag} from "./state.mjs";import {key} from "./key.mjs";console.log(bag[key]);',
    [{path:'key.mjs',sourceType:'module',
      code:'await Promise.resolve();export const key="secretField";'}]
  ),1);
});

test('acyclic independent key and owner survive proven identity forwarding',async()=>{
  await compare(graph(
    'export const bag={secretField:8};',
    'import {bag} from "./state.mjs";import {key} from "./key.mjs";'+
      'import {identity} from "./identity.mjs";'+
      'const alias=identity(bag);console.log(alias[key]);',
    [
      {path:'key.mjs',sourceType:'module',code:'export const key="secretField";'},
      {path:'identity.mjs',sourceType:'module',code:'export function identity(x){return x;}'}
    ]
  ),1);
});

test('cyclic ESM imports preserve early TDZ access to a third-module key',async()=>{
  await compare(graph(
    'import {probe} from "./main.mjs";export const bag={secretField:8};'+
      'try{console.log(probe());}catch(error){console.log(error.name);}',
    'import {bag} from "./state.mjs";import {key} from "./key.mjs";'+
      'export function probe(){return bag[key];}console.log(bag[key]);',
    [{path:'key.mjs',sourceType:'module',code:'export const key="secretField";'}]
  ),0);
});

test('dynamic third-module key remains outside the acyclic proof',async()=>{
  await compare(graph(
    'export const bag={secretField:8};',
    'import {bag} from "./state.mjs";import {key} from "./key.mjs";console.log(bag[key]);',
    [{path:'key.mjs',sourceType:'module',
      code:'const choose=()=>"secretField";export const key=choose();'}]
  ),0);
});

for(const [name,state,main,extras] of [
  ['key initialized after owner',
    'export const bag={secretField:8};export const key="secretField";',
    'import {bag,key} from "./state.mjs";console.log(bag[key]);',[]],
  ['mutable local alias remains dynamic',
    'export const key="secretField";export const bag={secretField:8};',
    'import {bag,key} from "./state.mjs";let local=key;console.log(bag[local]);',[]],
  ['owner reflection observes original field',
    'export const key="secretField";export const bag={secretField:8};',
    'import {bag,key} from "./state.mjs";console.log(bag[key],Object.keys(bag));',[]],
  ['failed computed callee preserves its source spelling',
    'export const key="secretField";export const bag={secretField:8};',
    'import {bag,key} from "./state.mjs";try{bag[key]();}catch(e){console.log(e.message);}',[]]
]) {
  test('imported computed key refuses unproved shape: '+name,
    async()=>compare(graph(state,main,extras),0));
}

test('imported immutable toString key still exposes original function source',async()=>{
  await compare(graph(
    'export const key="toString";export const bag={secretField:8};',
    'import {bag,key} from "./state.mjs";'+
      'function inspect(){return bag.secretField;}console.log(inspect[key]());'
  ),0);
});

test('imported immutable stack key still disables source-position-changing rewrites',async()=>{
  await compare(graph(
    'export const key="stack";export const bag={secretField:8};',
    'import {bag,key} from "./state.mjs";'+
      'const error=new Error("test");console.log(error[key].includes("main.mjs"),bag.secretField);'
  ),0);
});

test('opaque imported function key continues to refuse private-field renaming',async()=>{
  await compare(graph(
    'export const key=function secret(){return 2;};export const bag={secretField:8};',
    'import {bag,key} from "./state.mjs";console.log(bag.secretField,({})[key]);'
  ),0);
});

test('ESM cycle reads proven imported key after owner initialization',async()=>{
  await compare(graph(
    'import {probe} from "./main.mjs";export const key="secretField";'+
      'export const bag={secretField:8};console.log("cycle",probe());',
    'import {bag,key} from "./state.mjs";export function probe(){return bag[key];}'
  ),1);
});

test('ESM cycle owner-first and key-later order remains refused',async()=>{
  await compare(graph(
    'import {probe} from "./main.mjs";export const bag={secretField:8};'+
      'export const key="secretField";console.log("cycle",probe());',
    'import {bag,key} from "./state.mjs";export function probe(){return bag[key];}'
  ),0);
});

test('ESM cycle TDZ before owner initialization keeps exception semantics',async()=>{
  await compare(graph(
    'import {probe} from "./main.mjs";export const key="secretField";'+
      'try{console.log(probe());}catch(error){console.log(error.name);}'+
      'export const bag={secretField:8};console.log(probe());',
    'import {bag,key} from "./state.mjs";export function probe(){return bag[key];}'
  ),1);
});

test('source observation accepts unrelated imported global key declared after owner',async()=>{
  await compare(graph(
    'export const bag={secretField:8};export const key="otherGlobal";',
    'import {bag,key} from "./state.mjs";console.log(bag.secretField,globalThis[key]);'
  ),1);
});

test('source observation accepts unrelated verified key from a separate module',async()=>{
  await compare(graph(
    'export const bag={secretField:8};',
    'import {bag} from "./state.mjs";import {key} from "./keys.mjs";'+
      'console.log(bag.secretField,globalThis[key]);',
    [{path:'keys.mjs',sourceType:'module',code:'export const key="otherGlobal";'}]
  ),1);
});

test('imported browser source-reader key retains whole-graph refusal',async()=>{
  await compare(graph(
    'export const key="fetch";export const bag={secretField:8};',
    'import {bag,key} from "./state.mjs";console.log(bag.secretField,typeof globalThis[key]);'
  ),0);
});
