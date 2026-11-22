'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'module',code:string}} ESMFile */

/**
 * Execute native Web IDL-style CSSOMString input conversion with an external
 * test-host CSS binding. This isolates the ESM method import proof from the
 * browser identifier escaping algorithm tested separately in Chromium.
 * @param {ESMFile[]} files
 * @returns {Promise<{observed:string,value:number}>}
 */
async function execute(files) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'css-method-import-'));
  const previous=Object.getOwnPropertyDescriptor(globalThis,'CSS');
  Object.defineProperty(globalThis,'CSS',{
    configurable:true,value:{escape:/** @param {unknown} value */value=>String(value)}
  });
  try {
    for(const file of files)await atomicWrite(path.join(directory,file.path),file.code);
    const observer=await import(pathToFileURL(path.join(directory,'observer.mjs')).href);
    return await observer.observe();
  }finally {
    if(previous)Object.defineProperty(globalThis,'CSS',previous);
    else Reflect.deleteProperty(globalThis,'CSS');
    await fs.rm(directory,{recursive:true,force:true});
  }
}

/** @param {string} observed @param {boolean} [primitive] @returns {ESMFile[]} */
function sourceGraph(observed,primitive=false) {
  const state=primitive?
    'const state={secretField:23};const value=state.secretField;'+
    'export function inspect(){return value;}':
    'export function inspect(){const state={secretField:23};return state.secretField;}';
  return [
    {path:'method.mjs',sourceType:'module',code:'export const escape=CSS.escape;'},
    {path:'logic.mjs',sourceType:'module',code:state},
    {path:'observer.mjs',sourceType:'module',code:
      'import {escape} from "./method.mjs";'+
      'import {inspect} from "./logic.mjs";'+
      'export function observe(){return {observed:'+observed+',value:inspect()};}'}
  ];
}

/** @param {ESMFile[]} files @returns {ESMFile[]} */
function transform(files) {
  const result=obfuscateFiles(files,{mode:'coo',closedWorld:true,
    seed:'css-escape-method-import',properties:true,strings:true,identifiers:true});
  return result.files.map(file=>({
    path:file.path,sourceType:'module',code:/** @type {string} */(file.code)
  }));
}

test('imported native CSS.escape function observes exported peer source',async()=>{
  const before=sourceGraph('escape(inspect)');
  const after=transform(before);
  const native=await execute(before);
  assert.ok(native.observed.includes('secretField'));
  assert.deepEqual(await execute(after),native);
  assert.equal(after[1].code,before[1].code,
    'Consumer-imported native CSS.escape must preserve the producer source');
});

test('imported CSS.escape primitive literal still permits independent private key',async()=>{
  const before=sourceGraph('escape("literal")',true);
  const after=transform(before);
  assert.ok(!after[1].code.includes('secretField'),
    'Proven safe literal call should leave private-field owner eligible');
  assert.deepEqual(await execute(after),await execute(before));
});
