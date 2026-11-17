'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {atomicWrite}=require('../src/atomic');
const {partitionScoSelectedGraph}=require('../src');

const counter='let counter=0;export function next(){return ++counter;}';
const mutableConst='const state={count:0};export function next(){return ++state.count;}';
const functionObject='export function next(){next.count=(next.count??0)+1;return next.count;}';
const publicSource='import {next} from "./private/counter.mjs";'+
  'export async function secret(){return next();}'+
  'export function local(){return 1;}';

/** @param {string} code @returns {import('../src/sco-selected-graph').ScoSelectedGraph} */
function compile(code){
  return partitionScoSelectedGraph([{
    file:{path:'mixed.mjs',code:publicSource,sourceType:'module'},
    options:{
      seed:'sco-selected-state-20261117',privateNames:['secret'],
      privateModuleImports:['./private/counter.mjs'],
      privateModuleSources:[{path:'private/counter.mjs',code}]
    }
  }]);
}

test('independent source modules have distinct per-client lexical state before SCO',{
  timeout:15000
},async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sco-state-'));
  try{
    for(const name of ['client-a','client-b','shared-server']){
      await atomicWrite(path.join(root,name,'mixed.mjs'),publicSource);
      await atomicWrite(path.join(root,name,'private/counter.mjs'),counter);
    }
    /** @param {string} name */
    const load=async name=>import(pathToFileURL(path.join(root,name,'mixed.mjs')).href);
    const [clientA,clientB,server]=await Promise.all([
      load('client-a'),load('client-b'),load('shared-server')
    ]);
    assert.equal(await clientA.secret(),1);
    assert.equal(await clientB.secret(),1);
    assert.equal(await server.secret(),1);
    assert.equal(await server.secret(),2,
      'A shared server namespace keeps lexical state between client requests');
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
});

test('selected SCO graph refuses mutable imported module-level state and first-class function mutation',()=>{
  for(const source of [counter,mutableConst]){
    assert.throws(()=>compile(source),/unproved module-level mutable state/u,source);
  }
  assert.throws(()=>compile(functionObject),/escapes a shared function identity/u);
  const safe='"use strict";export const salt=41;'+
    'export function next(){return salt;}';
  assert.doesNotThrow(()=>compile(safe),
    'Private immutable constants and stateless direct exported functions remain eligible');
});

test('selected SCO graph inspects private source accessor bytes exactly once',()=>{
  let collectionReads=0;
  let codeReads=0;
  const source={
    path:'private/counter.mjs',
    get code(){
      codeReads++;
      if(codeReads!==1)throw Error('Private source was opened twice');
      return 'export function next(){return 7;}';
    }
  };
  const graph=partitionScoSelectedGraph([{
    file:{path:'mixed.mjs',code:publicSource},
    options:{
      privateNames:['secret'],privateModuleImports:['./private/counter.mjs'],
      get privateModuleSources(){
        collectionReads++;
        if(collectionReads!==1)throw Error('Private collection was read twice');
        return [source];
      }
    }
  }]);
  assert.equal(collectionReads,1);
  assert.equal(codeReads,1);
  assert.equal(graph.privateSourceDigests.length,2);
});


test('selected SCO graph refuses imported function-object property state in private caller',()=>{
  const unsafe='import {next} from "./private/counter.mjs";'+
    'export async function secret(){next.count=(next.count??0)+1;return next.count;}'+
    'export function local(){return 1;}';
  assert.throws(()=>partitionScoSelectedGraph([{
    file:{path:'mixed.mjs',code:unsafe,sourceType:'module'},
    options:{
      privateNames:['secret'],privateModuleImports:['./private/counter.mjs'],
      privateModuleSources:[{
        path:'private/counter.mjs',
        code:'export function next(){return 7;}'
      }]
    }
  }]),/exposes shared imported member state/u);
});

