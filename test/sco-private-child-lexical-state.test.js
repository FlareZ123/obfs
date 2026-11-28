'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {atomicWrite}=require('../src/atomic');
const {partitionScoSelectedAsyncExports,partitionScoSelectedGraph}=require('../src');

const rootCode=[
  'import {next} from "./private/next.mjs";',
  'export async function secret(){return next();}',
  'export function publicValue(){return 1;}'
].join('\n');
/** @param {string} child */
function compile(child){
  return partitionScoSelectedAsyncExports({
    path:'mixed.mjs',sourceType:'module',code:rootCode
  },{
    seed:'sco-private-module-lexical-20261128',
    privateNames:['secret'],
    privateModuleImports:['./private/next.mjs'],
    privateModuleSources:[{path:'private/next.mjs',code:child}]
  });
}
/** @param {string} child */
function graph(child){
  return partitionScoSelectedGraph([{
    file:{path:'mixed.mjs',sourceType:'module',code:rootCode},
    options:{
      seed:'sco-private-module-lexical-20261128',
      privateNames:['secret'],
      privateModuleImports:['./private/next.mjs'],
      privateModuleSources:[{path:'private/next.mjs',code:child}]
    }
  }]);
}

test('SCO standalone child rejects module-top-level let counter shared across clients',()=>{
  const source='let counter=0;export function next(){return ++counter;}';
  assert.throws(()=>compile(source),/unproved shared module lexical state/u);
  assert.throws(()=>graph(source),/unproved module-level mutable state/u);
});

test('SCO standalone child rejects exported mutable var lexical cell',()=>{
  assert.throws(()=>compile(
    'export var counter=0;export function next(){counter+=1;return counter;}'
  ),/unproved shared module lexical state/u);
});

test('SCO standalone child retains constant primitive top-level data',()=>{
  assert.doesNotThrow(()=>compile(
    'const offset=41;export function next(){return offset+1;}'
  ));
});

test('SCO standalone child retains local per-call lexical counter',()=>{
  assert.doesNotThrow(()=>compile(
    'export function next(){let counter=0;return ++counter;}'
  ));
});

test('native independent ESM module trees demonstrate mutable lexical state split',
  {timeout:15000},async()=>{
    const source='let counter=0;export function next(){return ++counter;}';
    const temp=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-child-lexical-'));
    try{
      for(const name of ['client-a','client-b','server']){
        await atomicWrite(path.join(temp,name,'mixed.mjs'),rootCode);
        await atomicWrite(path.join(temp,name,'private/next.mjs'),source);
      }
      const modules=await Promise.all(['client-a','client-b','server'].map(name=>
        import(pathToFileURL(path.join(temp,name,'mixed.mjs')).href)));
      const readings=[
        await modules[0].secret(),await modules[1].secret(),
        await modules[2].secret(),await modules[2].secret()
      ];
      assert.deepEqual(readings,[1,1,1,2]);
    }finally{
      await fs.rm(temp,{recursive:true,force:true});
    }
  });
