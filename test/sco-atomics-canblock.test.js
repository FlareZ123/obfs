'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {partitionScoSelectedAsyncExports}=require('../src');

/** @typedef {{path:string,code:string}} PrivateModule */

/**
 * @param {string} body
 * @param {0|1|2} depth
 * @returns {ReturnType<typeof partitionScoSelectedAsyncExports>}
 */
function partition(body,depth){
  const direct=depth===0;
  const code=direct?
    'export async function protectedOp(){'+body+'}export function visible(){return 7;}' :
    'import {read} from "./private/engine.mjs";'+
      'export async function protectedOp(){return read();}'+
      'export function visible(){return 7;}';
  /** @type {PrivateModule[]} */
  const privateModuleSources=[];
  if(depth>0){
    privateModuleSources.push({
      path:'private/engine.mjs',
      code:depth===1?'export function read(){'+body+'}':
        'import {leaf} from "./deep/leaf.mjs";'+
          'export function read(){return leaf();}'
    });
    if(depth===2)privateModuleSources.push({
      path:'private/deep/leaf.mjs',code:'export function leaf(){'+body+'}'
    });
  }
  return partitionScoSelectedAsyncExports(
    {path:'mixed.mjs',sourceType:'module',code},
    {
      seed:'sco-atomics-agent-can-block-20261122',
      privateNames:['protectedOp'],
      ...(direct?{}:{
        privateModuleImports:['./private/engine.mjs'],
        privateModuleSources
      })
    }
  );
}

test('Node permits a zero-duration wait on its main execution agent',()=>{
  const cell=new Int32Array(new SharedArrayBuffer(4));
  assert.equal(Atomics.wait(cell,0,1,0),'not-equal');
});

test('SCO declines host agent can-block-sensitive Atomics.wait',()=>{
  const unsafe=[
    'const cell=new Int32Array(new SharedArrayBuffer(4));'+
      'return Atomics.wait(cell,0,1,0);',
    'const cell=new Int32Array(new SharedArrayBuffer(4));'+
      'return Atomics["wait"](cell,0,1,0);',
    'const cell=new Int32Array(new SharedArrayBuffer(4));'+
      'const wait=Atomics.wait;return wait(cell,0,1,0);',
    'const cell=new Int32Array(new SharedArrayBuffer(4));'+
      'const {wait}=Atomics;return wait(cell,0,1,0);',
    'const cell=new Int32Array(new SharedArrayBuffer(4));'+
      'const atomic=Atomics;return atomic.wait(cell,0,1,0);',
    'const cell=new Int32Array(new SharedArrayBuffer(4));'+
      'return globalThis.Atomics.wait(cell,0,1,0);',
    'const cell=new Int32Array(new SharedArrayBuffer(4));'+
      'const {Atomics:atomic}=globalThis;return atomic.wait(cell,0,1,0);',
    'const cell=new Int32Array(new SharedArrayBuffer(4));'+
      'const root=globalThis;return root.Atomics.wait(cell,0,1,0);',
    'const cell=new Int32Array(new SharedArrayBuffer(4));'+
      'const wait=Atomics["wait"];return wait(cell,0,1,0);',
    'const cell=new Int32Array(new SharedArrayBuffer(4));'+
      'const key="wait";return Atomics[key](cell,0,1,0);',
    'const cell=new Int32Array(new SharedArrayBuffer(4));'+
      'const wait=Atomics.wait.bind(Atomics);return wait(cell,0,1,0);'
  ];
  /** @type {string[]} */
  const admitted=[];
  for(const body of unsafe)for(const depth of /** @type {const} */ ([0,1,2])){
    try{
      partition(body,depth);
      admitted.push('depth='+depth+' / '+body);
    }catch(error){
      assert.ok(error instanceof Error);
    }
  }
  console.log('SCO Atomics.wait source admission='+JSON.stringify({
    tested:unsafe.length*3,admitted
  }));
  assert.deepEqual(admitted,[],
    'Relocation from a browser main agent to Node changes Atomics.wait behavior');
});

test('SCO retains a local nondistributed atomic load and inert wait label',()=>{
  const safe=[
    'const cell=new Int32Array(new ArrayBuffer(4));return Atomics.load(cell,0);',
    'return Atomics.isLockFree(4);',
    "const record={wait:42};return record.wait;"
  ];
  /** @type {string[]} */
  const refused=[];
  for(const body of safe)for(const depth of /** @type {const} */ ([0,1,2])){
    try{
      const output=partition(body,depth);
      assert.deepEqual(output.privateNames,['protectedOp']);
    }catch(error){
      refused.push('depth='+depth+' / '+body+' / '+String(error));
    }
  }
  console.log('SCO Atomics safe-positive admission='+JSON.stringify({
    tested:safe.length*3,refused
  }));
  assert.deepEqual(refused,[],
    'Deterministic local Atomics and inert field names should stay eligible');
});
