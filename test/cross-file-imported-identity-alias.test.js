'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,code:string,sourceType:'module'}} File */

/** @param {string} implementation @param {string} entry @returns {File[]} */
function graph(implementation,entry){
  return [
    {path:'state.mjs',sourceType:'module',
      code:'export const state={secretField:17,otherField:5};'},
    {path:'identity.mjs',sourceType:'module',code:implementation},
    {path:'entry.mjs',sourceType:'module',code:entry}
  ];
}

/** @param {File[]} files @returns {ReturnType<typeof obfuscateFiles>} */
function compile(files){
  return obfuscateFiles(files,{
    mode:'coo',closedWorld:true,
    seed:'cross-file-imported-pure-identity-local-const-alias',
    identifiers:false,strings:false,properties:true
  });
}

/** @param {File[]|ReturnType<typeof obfuscateFiles>['files']} files @returns {Promise<string>} */
async function execute(files){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-identity-const-'));
  try{
    for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
    const child=spawnSync(process.execPath,[path.join(root,'entry.mjs')],{
      encoding:'utf8',timeout:12000
    });
    assert.equal(child.status,0,child.stderr);
    return child.stdout;
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

/** @param {string} name @param {File[]} files @returns {Promise<void>} */
async function expectRewritten(name,files){
  const result=compile(files);
  assert.equal(result.crossFile.properties,2,
    name+': expected both proven own fields to be renamed');
  assert.equal(result.crossFile.objects,1,name);
  const state=result.files.find(file=>file.path==='state.mjs');
  assert.ok(state);
  assert.doesNotMatch(String(state.code),/secretField|otherField/u);
  assert.equal(await execute(result.files),await execute(files),name);
}

/** @param {string} name @param {File[]} files @returns {Promise<void>} */
async function expectRefused(name,files){
  const result=compile(files);
  assert.equal(result.crossFile.properties,0,name);
  assert.equal(await execute(result.files),await execute(files),name);
}

const fn='export function identity(x){return x;}';
const arrow='export const identity=x=>x;';

test('top-level const aliases an imported pure function and forwards a private record',async()=>{
  await expectRewritten('basic',graph(fn,
    'import {state} from "./state.mjs";'+
    'import {identity} from "./identity.mjs";'+
    'const invoke=identity;const alias=invoke(state);'+
    'console.log(JSON.stringify([alias.secretField,alias.otherField]));'));
});

test('immutable imported arrow can be aliased and used with the direct import',async()=>{
  await expectRewritten('arrow and mixed direct call',graph(arrow,
    'import {state} from "./state.mjs";'+
    'import {identity as relay} from "./identity.mjs";'+
    'const forward=relay;const value=forward(state);'+
    'console.log(JSON.stringify([value.secretField,relay(state).otherField]));'));
});

test('two immutable aliases of the same imported identity remain direct-only',async()=>{
  await expectRewritten('two aliases',graph(fn,
    'import {state} from "./state.mjs";'+
    'import {identity} from "./identity.mjs";'+
    'const first=identity;const second=identity;'+
    'console.log(JSON.stringify([first(state).secretField,second(state).otherField]));'));
});

for(const [name,entry] of /** @type {[string,string][]} */ ([
  ['mutable local relay',
    'let invoke=identity;console.log(invoke(state).secretField);'],
  ['exported local relay',
    'export const invoke=identity;console.log(invoke(state).secretField);'],
  ['arbitrary higher-order relay consumption',
    'const invoke=identity;const consume=fn=>fn(state);'+
      'console.log(consume(invoke).secretField);'],
  ['local relay function-source observation',
    'const invoke=identity;console.log(invoke.toString().length,invoke(state).secretField);'],
  ['local relay reflective root access',
    'const invoke=identity;console.log(Object.keys(state),invoke(state).secretField);'],
  ['local relay native call adapter',
    'const invoke=identity;console.log(invoke.call(null,state).secretField);']
])) {
  test('unsafe imported identity relay safely declines: '+name,async()=>{
    const files=graph(fn,
      'import {state} from "./state.mjs";'+
      'import {identity} from "./identity.mjs";'+entry);
    await expectRefused(name,files);
  });
}
