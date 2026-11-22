'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {partitionScoSelectedAsyncExports}=require('../src');

/** @typedef {{path:string,code:string}} PrivateSource */

/**
 * @param {string} body
 * @param {0|1|2} depth
 */
function compile(body,depth) {
  /** @type {PrivateSource[]} */
  const privateModuleSources=[];
  const direct=depth===0;
  const source=direct?
    'export async function protectedOp(){'+body+'}export function visible(){return 7;}' :
    'import {compute} from "./private/engine.mjs";'+
      'export async function protectedOp(){return compute();}'+
      'export function visible(){return 7;}';
  if(depth>0){
    privateModuleSources.push({
      path:'private/engine.mjs',
      code:depth===1?'export function compute(){'+body+'}':
        'import {leaf} from "./deep/leaf.mjs";'+
          'export function compute(){return leaf();}'
    });
    if(depth===2)privateModuleSources.push({
      path:'private/deep/leaf.mjs',
      code:'export function leaf(){'+body+'}'
    });
  }
  return partitionScoSelectedAsyncExports(
    {path:'mixed.mjs',sourceType:'module',code:source},
    {
      seed:'sco-switch-discriminant-scope-20261122',privateNames:['protectedOp'],
      ...(direct?{}:{
        privateModuleImports:['./private/engine.mjs'],
        privateModuleSources
      })
    }
  );
}

test('SCO switch discriminant is evaluated before case lexical bindings exist',()=>{
  const unsafe=[
    'switch(externalBridge){case 0:const externalBridge=41;return 42;default:return 7;}',
    'switch(externalBridge){case 0:const {externalBridge}={externalBridge:41};return 42;default:return 7;}',
    'switch(externalBridge){case 0:class externalBridge{}return 42;default:return 7;}',
    'switch(externalBridge){case 0:function externalBridge(){}return 42;default:return 7;}'
  ];
  /** @type {string[]} */
  const admitted=[];
  for(const body of unsafe)for(const depth of /** @type {const} */ ([0,1,2])){
    try{
      compile(body,depth);
      admitted.push('depth='+depth+': '+body);
    }catch(error){
      assert.ok(error instanceof Error);
    }
  }
  console.log('switch-discriminant-scope-negative='+JSON.stringify({
    tested:unsafe.length*3,admitted
  }));
  assert.deepEqual(admitted,[],
    'Case-block declarations cannot bind the earlier switch discriminant');
});

test('SCO switch accepts a real enclosing binding and case-local use',()=>{
  const safe=[
    'const externalBridge=0;switch(externalBridge){case 0:const local=41;return local;default:return 7;}',
    'switch(0){case 0:const externalBridge=41;return externalBridge;default:return 7;}'
  ];
  /** @type {string[]} */
  const refused=[];
  for(const body of safe)for(const depth of /** @type {const} */ ([0,1,2])){
    try{
      const partition=compile(body,depth);
      assert.deepEqual(partition.privateNames,['protectedOp']);
    }catch(error){
      refused.push('depth='+depth+': '+body+': '+String(error));
    }
  }
  console.log('switch-discriminant-scope-positive='+JSON.stringify({
    tested:safe.length*3,refused
  }));
  assert.deepEqual(refused,[],
    'Enclosing literals and case-local lexical reads should remain transformable');
});
