'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {partitionScoSelectedAsyncExports}=require('../src');

/** @param {string} body */
function compile(body){
  return partitionScoSelectedAsyncExports({
    path:'decoder-binding.mjs',sourceType:'module',
    code:'export async function protectedOp(){'+body+'}\nexport function visible(){return 7;}'
  },{seed:'sco-decoder-byte-binding-review-20261127',privateNames:['protectedOp']});
}

/** @param {string} body */
function compileDependency(body){
  return partitionScoSelectedAsyncExports({
    path:'entry.mjs',sourceType:'module',
    code:'import {read} from "./private/decoder.mjs";export async function protectedOp(){return read();}export function visible(){return 7;}'
  },{
    seed:'sco-decoder-byte-binding-dependency-20261127',privateNames:['protectedOp'],
    privateModuleImports:['./private/decoder.mjs'],
    privateModuleSources:[{path:'private/decoder.mjs',code:'export function read(){'+body+'}'}]
  });
}
const refusals=[
  "const Uint8Array={of(){return 'bad';}};return new TextDecoder().decode(Uint8Array.of(65));",
  "const Uint8Array=class {};return new TextDecoder().decode(new Uint8Array([65]));",
  "const Real=Uint8Array;{const Uint8Array={of(){return Real.of(128);}};return new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.of(65));}"
];
for(const body of refusals){
  test('selected root refuses shadowed byte-view proof: '+body,()=>{
    assert.throws(()=>compile(body),TypeError);
  });
  test('private dependency refuses shadowed byte-view proof: '+body,()=>{
    assert.throws(()=>compileDependency(body),TypeError);
  });
}
for(const body of [
  "return new TextDecoder().decode(new Uint8Array([65]));",
  "return new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.of(65));",
  "function unused(){const Uint8Array={of(){return 'bad';}};return Uint8Array.of(65);}return new TextDecoder().decode(Uint8Array.of(65));"
]){
  test('selected root retains genuine intrinsic byte view: '+body,()=>{
    assert.deepEqual(compile(body).privateNames,['protectedOp']);
  });
  test('private dependency retains genuine intrinsic byte view: '+body,()=>{
    assert.deepEqual(compileDependency(body).privateNames,['protectedOp']);
  });
}
