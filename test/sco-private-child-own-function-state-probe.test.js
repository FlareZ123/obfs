'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {partitionScoSelectedGraph,partitionScoSelectedAsyncExports}=require('../src');
const {atomicWrite}=require('../src/atomic');

const selectedCode=[
  'import {next} from "./private/next.mjs";',
  'export async function secret(){return next();}',
  'export function local(){return 1;}'
].join('\n');
const childSource={
  path:'private/next.mjs',
  code:'export function next(){next.count=(next.count??0)+1;return next.count;}'
};
/** @returns {import('../src/sco-selective-partition').ScoSelectiveOptions} */
function options(){
  return {
    seed:'sco-private-child-self-property-20261123',
    privateNames:['secret'],
    privateModuleImports:['./private/next.mjs'],
    privateModuleSources:[childSource]
  };
}
function standalone(){
  return partitionScoSelectedAsyncExports({
    path:'mixed.mjs',sourceType:'module',code:selectedCode
  },options());
}
function graph(){
  return partitionScoSelectedGraph([{
    file:{path:'mixed.mjs',sourceType:'module',code:selectedCode},
    options:options()
  }]);
}

test('standalone SCO refuses stateful own-property mutation in imported child',()=>{
  assert.throws(standalone,/private dependency escapes a shared function identity/u);
});

test('standalone SCO refuses const-arrow child own-property state',()=>{
  const alternate={...options(),privateModuleSources:[{
    path:'private/next.mjs',
    code:'export const next=()=>{next.count=(next.count??0)+1;return next.count;};'
  }]};
  assert.throws(()=>partitionScoSelectedAsyncExports({
    path:'mixed.mjs',sourceType:'module',code:selectedCode
  },alternate),/private dependency escapes a shared function identity/u);
});

test('standalone SCO rejects named function-expression self-property state',()=>{
  const alternate={...options(),privateModuleSources:[{
    path:'private/next.mjs',
    code:'export const next=function inner(){inner.count=(inner.count??0)+1;return inner.count;};'
  }]};
  assert.throws(()=>partitionScoSelectedAsyncExports({
    path:'mixed.mjs',sourceType:'module',code:selectedCode
  },alternate),/private dependency escapes a shared function identity/u);
});

test('standalone SCO rejects class identity state in a private child',()=>{
  const alternate={...options(),privateModuleSources:[{
    path:'private/next.mjs',
    code:'export class next{static count=0;constructor(){next.count++;this.value=next.count;}}'
  }]};
  assert.throws(()=>partitionScoSelectedAsyncExports({
    path:'mixed.mjs',sourceType:'module',code:selectedCode
  },alternate),/private dependency escapes a shared function identity/u);
});

test('standalone SCO preserves stateless const-arrow direct calls',()=>{
  const alternate={...options(),privateModuleSources:[{
    path:'private/next.mjs',code:'export const next=()=>7;'
  }]};
  assert.doesNotThrow(()=>partitionScoSelectedAsyncExports({
    path:'mixed.mjs',sourceType:'module',code:selectedCode
  },alternate));
});

test('standalone SCO retains direct stateless private function calls',()=>{
  const safe={...options(),privateModuleSources:[{
    path:'private/next.mjs',code:'export function next(){return 7;}'
  }]};
  assert.doesNotThrow(()=>partitionScoSelectedAsyncExports({
    path:'mixed.mjs',sourceType:'module',code:selectedCode
  },safe));
});

test('SCO private child self-property graph composer refuses shared function identity',()=>{
  assert.throws(graph,/private dependency escapes a shared function identity/u);
  console.log('SCO_CHILD_FUNCTION_STATE_PROBE graph composer refuses the same private dependency');
});

test('native ESM client trees isolate dependency function-object counters',{timeout:15000},async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-private-child-own-state-'));
  try{
    for(const name of ['client-a','client-b','server']){
      await atomicWrite(path.join(root,name,'mixed.mjs'),selectedCode);
      await atomicWrite(path.join(root,name,childSource.path),childSource.code);
    }
    const modules=await Promise.all(['client-a','client-b','server'].map(name=>
      import(pathToFileURL(path.join(root,name,'mixed.mjs')).href)));
    const readings=[
      await modules[0].secret(),
      await modules[1].secret(),
      await modules[2].secret(),
      await modules[2].secret()
    ];
    assert.deepEqual(readings,[1,1,1,2]);
    console.log('SCO_CHILD_FUNCTION_STATE_PROBE native independent clients, shared server readings:',JSON.stringify(readings));
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
});
