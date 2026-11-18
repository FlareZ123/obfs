'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {obfuscateFiles}=require('../src/core');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'module',code:string}} ESMFile */

/**
 * Execute imported source text through the real Node ESM loader and Blob API.
 * Source directories must differ to avoid ESM module-cache contamination.
 * @param {ESMFile[]} files
 * @returns {Promise<{text:string,value:number}>}
 */
async function execute(files) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-blob-interfile-'));
  try {
    for(const file of files)await atomicWrite(path.join(directory,file.path),file.code);
    const module=await import(pathToFileURL(path.join(directory,'observer.mjs')).href);
    return await module.observe();
  } finally {
    await fs.rm(directory,{recursive:true,force:true});
  }
}

/**
 * @param {string} observation
 * @param {boolean} [primitiveOwner]
 * @returns {ESMFile[]}
 */
function sources(observation,primitiveOwner=false) {
  return [
    {path:'logic.mjs',sourceType:'module',code:primitiveOwner?
      'const owner={secretField:29};const value=owner.secretField;'+
      'export function inspect(){return value;}' :
      'export function inspect(){const owner={secretField:29};return owner.secretField;}'},
    {path:'observer.mjs',sourceType:'module',code:
      'import {inspect} from "./logic.mjs";'+
      'export async function observe(){return {text:'+observation+',value:inspect()};}'}
  ];
}

/** @param {ESMFile[]} files @returns {ESMFile[]} */
function transformed(files) {
  const output=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'blob-imported-source-v1',
    identifiers:true,strings:true,properties:true
  });
  return output.files.map(file=>({
    path:file.path,sourceType:'module',code:String(file.code)
  }));
}

const observers=[
  ['direct options', 'new Blob([],{type:inspect}).type'],
  ['bound constructor', 'new (Blob.bind(null))([],{type:inspect}).type'],
  ['options captured in bound constructor', 'new (Blob.bind(null,[],{type:inspect}))().type'],
  ['owned constructor', 'new ({Make:Blob}).Make([],{type:inspect}).type'],
  ['reflection', 'Reflect.construct(Blob,[[],{type:inspect}]).type']
];

for(const [name,expression] of observers) {
  test('cross-file native Blob '+name+' preserves imported function source',async()=>{
    const original=sources(expression);
    const generated=transformed(original);
    const native=await execute(original);
    assert.match(native.text,/secretfield/iu,name+' native imported-source witness');
    assert.equal(native.value,29);
    assert.equal(generated[0].code,original[0].code,
      name+' observed exporter must remain byte-for-byte unchanged');
    assert.deepEqual(await execute(generated),native);
  });
}

test('primitive Blob options preserve independent cross-file private property rename',async()=>{
  const original=sources('new Blob([],{type:"text/plain"}).type',true);
  const generated=transformed(original);
  const native=await execute(original);
  assert.equal(native.text,'text/plain');
  assert.deepEqual(await execute(generated),native);
  assert.doesNotMatch(generated[0].code,/secretField/u,
    'Unrelated provably private field should still be renamed');
});
