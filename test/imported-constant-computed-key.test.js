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

for(const [name,state,main,extras] of [
  ['key initialized after owner',
    'export const bag={secretField:8};export const key="secretField";',
    'import {bag,key} from "./state.mjs";console.log(bag[key]);',[]],
  ['key from different exporting module',
    'export const bag={secretField:8};',
    'import {bag} from "./state.mjs";import {key} from "./key.mjs";console.log(bag[key]);',
    [{path:'key.mjs',sourceType:'module',code:'export const key="secretField";'}]],
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
