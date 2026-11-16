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
 * Compare actual Node loader output including exported own-key shape.
 * @param {ReadonlyArray<{path:string,code:string|Buffer}>} files
 * @returns {Promise<string>}
 */
async function execute(files){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-reflect-method-alias-'));
  try{
    for(const file of files)await atomicWrite(path.join(dir,file.path),file.code);
    const processResult=spawnSync(process.execPath,[path.join(dir,'main.mjs')],{
      encoding:'utf8',timeout:15000
    });
    assert.equal(processResult.status,0,processResult.stderr);
    return processResult.stdout;
  }finally{
    await fs.rm(dir,{recursive:true,force:true});
  }
}

/**
 * The alias may hide Reflect.get from the local call AST.
 * @param {string} code
 * @returns {ModuleFile[]}
 */
function fixture(code){
  return [
    {path:'state.mjs',sourceType:'module',code:'export const state={secretField:59};'},
    {path:'main.mjs',sourceType:'module',code:[
      'import {state} from "./state.mjs";',
      'const key=["con","structor"].join("");',
      code,
      'const run=Loader('+JSON.stringify('return import("./state.mjs")')+');',
      'const remote=await run();',
      'console.log(JSON.stringify([state.secretField,Object.keys(remote.state),remote.state.secretField]));'
    ].join('\n')}
  ];
}

for(const [label,source] of [
  ['direct Reflect.get','const Loader=Reflect.get(Number,key);'],
  ['aliased Reflect.get','const get=Reflect.get;const Loader=get(Number,key);'],
  ['destructured getter','const {get}=Reflect;const Loader=get(Number,key);'],
  ['bound getter','const get=Reflect.get.bind(Reflect);const Loader=get(Number,key);'],
  ['getter.call','const get=Reflect.get;const Loader=get.call(Reflect,Number,key);'],
  ['computed Reflect method alias','const R=Reflect;const method="get";const Loader=R[method](Number,key);']
]) {
  test('native Reflect loader alias must refuse ESM property rename: '+label,async()=>{
    const original=fixture(source);
    const expected=await execute(original);
    assert.equal(expected,'[59,["secretField"],59]\n');
    const transformed=obfuscateFiles(original,{
      mode:'coo',closedWorld:true,seed:'reflect-method-alias-'+label,
      strings:false,identifiers:false
    });
    assert.equal(transformed.crossFile.properties,0,
      'Native Reflect method can retrieve Function without a static import graph edge');
    assert.equal(await execute(transformed.files),expected);
  });
}

test('known Reflect.get on a literal field keeps cross-file property rename coverage',async()=>{
  /** @type {ModuleFile[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',code:'export const state={secretField:59};'},
    {path:'main.mjs',sourceType:'module',code:
      'import {state} from "./state.mjs";const get=Reflect.get;'+
      'console.log(state.secretField+get({value:3},"value"));'}
  ];
  const expected=await execute(files);
  assert.equal(expected,'62\n');
  const transformed=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'safe-reflect-method-alias',
    strings:false,identifiers:false
  });
  assert.equal(transformed.crossFile.properties,1);
  assert.equal(await execute(transformed.files),expected);
});
