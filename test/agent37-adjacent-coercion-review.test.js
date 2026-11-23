'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {obfuscateFiles}=require('../src/core');
const {collectVerifiedImportedPrimitives}=require('../src/cross-properties');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,code:string,sourceType:'module'}} Source */

/**
 * Keep an ESM owner, an adjacent primitive snapshot and a real cross-file
 * observer in the same closed-world graph. Only the final expression varies.
 * @param {string} key
 * @param {string} expression
 * @returns {Source[]}
 */
function graph(key,expression) {
  return [
    {path:'state.mjs',sourceType:'module',code:
      'export const state={'+key+':3,otherKey:5};'+
      'export const observed=state.'+key+';'},
    {path:'worker.mjs',sourceType:'module',code:
      'import {state} from "./state.mjs";'+
      'export function work(){return state.'+key+'+state.otherKey;}'},
    {path:'index.mjs',sourceType:'module',code:
      'import {state,observed} from "./state.mjs";'+
      'import {work} from "./worker.mjs";'+
      'let text;try{text=String('+expression+');}'+
      'catch(error){text=error.name;}'+
      'export const result=String(observed)+"|"+String(work())+"|"+text;'}
  ];
}

/**
 * @param {Source[]} files
 * @returns {Promise<string>}
 */
async function execute(files) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-adjacent-coercion-'));
  try {
    for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
    const entry=await import(pathToFileURL(path.join(root,'index.mjs')).href);
    return String(entry.result);
  }finally {
    await fs.rm(root,{recursive:true,force:true});
  }
}

test('adjacent primitive proof retains four-file cross-owner positive yield',async()=>{
  /** @type {Source[]} */
  const source=[
    {path:'state.mjs',sourceType:'module',code:
      'export const state={secretValue:3,otherKey:5};'+
      'export const internalValue=state.secretValue;'},
    {path:'workerA.mjs',sourceType:'module',code:
      'import {state} from "./state.mjs";'+
      'function worker(param){const alias=param;return alias.secretValue+alias.otherKey;}'+
      'export const partial=worker(state);'},
    {path:'workerB.mjs',sourceType:'module',code:
      'import {state} from "./state.mjs";'+
      'const {secretValue:factor,otherKey}=state;export const partial=factor*otherKey;'},
    {path:'index.mjs',sourceType:'module',code:
      'import {state,internalValue} from "./state.mjs";'+
      'import {partial as a} from "./workerA.mjs";'+
      'import {partial as b} from "./workerB.mjs";'+
      'export const result=(+a)+(+b)+internalValue+state.secretValue;'}
  ];
  assert.equal(collectVerifiedImportedPrimitives(source).get('index.mjs')?.has('internalValue'),true);
  const compiled=obfuscateFiles(source,{mode:'coo',closedWorld:true,
    properties:true,strings:false,identifiers:false,seed:'adjacent-coercion-positive'});
  assert.equal(compiled.crossFile.objects,1);
  assert.equal(compiled.crossFile.properties,2);
  const emitted=compiled.files.map(file=>({
    path:file.path,sourceType:/** @type {'module'} */ ('module'),code:String(file.code)
  }));
  assert.equal(await execute(source),'29');
  assert.equal(await execute(emitted),await execute(source));
});

for(const expression of ['state','state+""']) {
  test('adjacent own toString primitive cannot change implicit object coercion: '+expression,async()=>{
    const source=graph('toString',expression);
    assert.equal(collectVerifiedImportedPrimitives(source).get('index.mjs')?.has('observed'),true);
    const compiled=obfuscateFiles(source,{mode:'coo',closedWorld:true,
      properties:true,strings:false,identifiers:false,seed:'adjacent-coercion-'+expression});
    const emitted=compiled.files.map(file=>({
      path:file.path,sourceType:/** @type {'module'} */ ('module'),code:String(file.code)
    }));
    const original=await execute(source);
    assert.equal(original,'3|8|TypeError');
    assert.equal(await execute(emitted),original,
      'String/ToPrimitive must keep the owner\'s noncallable own toString property');
  });
}
