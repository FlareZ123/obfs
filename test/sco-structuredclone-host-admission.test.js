'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {partitionScoSelectedAsyncExports,partitionScoSelectedGraph}=require('../src');

/**
 * @param {string} body
 * @param {string} [publicBody]
 * @returns {ReturnType<typeof partitionScoSelectedAsyncExports>}
 */
function selected(body,publicBody='return 7;'){
  return partitionScoSelectedAsyncExports({
    path:'clone-host.mjs',sourceType:'module',
    code:'export async function privateOp(){'+body+'}\n'+
      'export function visible(){'+publicBody+'}'
  },{privateNames:['privateOp'],seed:'clone-host-20261128'});
}

test('selected SCO refuses unproved structuredClone browser/Node error semantics',()=>{
  const bodies=[
    "try{structuredClone(Symbol('x'));return 'ok';}catch(e){return e.message;}",
    "try{structuredClone(function f(){});return 'ok';}catch(e){return e.message;}",
    "const clone=structuredClone;try{clone(Symbol('x'));}catch(e){return e.message;}",
    "try{return structuredClone(Symbol('x'));}catch(e){return e.message;}"
  ];
  for(const body of bodies){
    assert.throws(()=>selected(body),{name:'TypeError'},body);
  }
});

test('selected SCO refuses structuredClone in imported private closure',()=>{
  assert.throws(()=>partitionScoSelectedGraph([{
    file:{
      path:'clone-entry.mjs',sourceType:'module',
      code:"import {leaf} from './private/leaf.mjs';"+
        'export async function privateOp(){return leaf();}'+
        'export function visible(){return 7;}'
    },
    options:{
      privateNames:['privateOp'],
      seed:'clone-host-leaf-20261128',
      privateModuleImports:['./private/leaf.mjs'],
      privateModuleSources:[{
        path:'private/leaf.mjs',
        code:"export function leaf(){try{structuredClone(Symbol('x'));}catch(e){return e.message;}}"
      }]
    }
  }]),{name:'TypeError'});
});

test('selected SCO retains unrelated private math and client-native structuredClone',()=>{
  const result=selected('return Math.imul(6,7);',
    'return structuredClone({value:7}).value;');
  assert.deepEqual(result.privateNames,['privateOp']);
  assert.match(result.clientFile.code,/structuredClone/u);
});

test('local directly proved structuredClone shadow stays selected',()=>{
  const result=selected(
    'function structuredClone(x){return x;}'+
    'return structuredClone({value:7}).value;'
  );
  assert.deepEqual(result.privateNames,['privateOp']);
});
