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

/** @param {string} expression @returns {ESMFile[]} */
function sources(expression) {
  return [
    {path:'logic.mjs',sourceType:'module',code:
      'export function inspect(){const state={secretField:19};return state.secretField;}'},
    {path:'observer.mjs',sourceType:'module',code:
      'import {inspect} from "./logic.mjs";'+
      'export function observe(){return {text:'+expression+',value:inspect()};}'}
  ];
}

/**
 * @param {ESMFile[]} files
 * @returns {Promise<{text:string,value:number}>}
 */
async function execute(files) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-reflect-construct-'));
  try {
    for(const file of files)await atomicWrite(path.join(directory,file.path),file.code);
    const observer=await import(pathToFileURL(path.join(directory,'observer.mjs')).href);
    return observer.observe();
  } finally {
    await fs.rm(directory,{recursive:true,force:true});
  }
}

/** @param {ESMFile[]} files @returns {ESMFile[]} */
function transformed(files) {
  const result=obfuscateFiles(files,{mode:'coo',closedWorld:true,
    seed:'reflect-construct-interfile-source',strings:true,
    properties:true,identifiers:true});
  return result.files.map(file=>({
    path:file.path,sourceType:'module',code:/** @type {string} */(file.code)
  }));
}

for(const [name,expression] of /** @type {Array<[string,string]>} */([
  ['pattern first argument','Reflect.construct(RegExp,[inspect]).source'],
  ['function-valued flags second argument',
    '(()=>{try{Reflect.construct(RegExp,["abc",inspect]);return "unexpected-success";}catch(error){return error.message;}})()']
])) {
  test('cross-file Reflect.construct '+name+' preserves exported function source',async()=>{
    const original=sources(expression);
    const emitted=transformed(original);
    const expected=await execute(original);
    assert.equal(expected.value,19);
    assert.match(expected.text,/secretField/u);
    assert.deepEqual(await execute(emitted),expected);
    assert.equal(emitted[0].code,original[0].code,
      'Imported function source must be byte-preserved');
  });
}

test('primitive Reflect.construct pattern and flags retain a private key rename',async()=>{
  const original=sources('Reflect.construct(RegExp,["abc","i"]).source');
  original[0].code='const state={secretField:19};const value=state.secretField;'+
    'export function inspect(){return value;}';
  const emitted=transformed(original);
  assert.deepEqual(await execute(emitted),await execute(original));
  assert.ok(!emitted[0].code.includes('secretField'),
    'Proven primitive arguments permit unrelated private-field rewriting');
});
