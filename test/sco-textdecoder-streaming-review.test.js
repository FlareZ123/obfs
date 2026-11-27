'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {partitionScoSelectedAsyncExports}=require('../src');
/** @param {string} body @param {boolean} dependency */
function compile(body,dependency){
  const options={seed:'sco-streaming-decoder-review-20261127',privateNames:['protectedOp']};
  if(!dependency)return partitionScoSelectedAsyncExports({
    path:'entry.mjs',sourceType:'module',
    code:'export async function protectedOp(){'+body+'}export function visible(){return 7;}'
  },options);
  return partitionScoSelectedAsyncExports({
    path:'entry.mjs',sourceType:'module',
    code:'import {read} from "./private/decoder.mjs";export async function protectedOp(){return read();}export function visible(){return 7;}'
  },{
    ...options,privateModuleImports:['./private/decoder.mjs'],
    privateModuleSources:[{path:'private/decoder.mjs',code:'export function read(){'+body+'}'}]
  });
}
const mismatchWitnesses=[
  'const d=new TextDecoder();return d.decode(Uint8Array.of(240),{stream:true})+"|"+d.decode(Uint8Array.of(203,184,87));',
  'const d=new TextDecoder();const a=d.decode(Uint8Array.of(242),{stream:true});const b=d.decode(Uint8Array.of(209,141,65),{stream:true});return [a,b,d.decode()];',
  'const d=new TextDecoder();const a=d.decode(Uint8Array.of(211),{stream:true});return a+d.decode(Uint8Array.of(244,217,179,38));'
];
const conservativePartial=[
  'const d=new TextDecoder();return d.decode(Uint8Array.of(226),{stream:true})+d.decode(Uint8Array.of(130,172));',
  'const d=new TextDecoder();return d.decode(Uint8Array.of(128),{stream:true});'
];
const safe=[
  'const d=new TextDecoder();return d.decode(Uint8Array.of(226,130,172),{stream:true})+d.decode(Uint8Array.of(65));',
  'const d=new TextDecoder();return d.decode(Uint8Array.of(239,187,191),{stream:true})+d.decode(Uint8Array.of(239,187,191));',
  'const d=new TextDecoder();return d.decode(Uint8Array.of(65),{stream:true})+d.decode(Uint8Array.of(240));',
  'const d=new TextDecoder();return d.decode(Uint8Array.of(240),{stream:false});',
  'const d=new TextDecoder();return d.decode(Uint8Array.of(128));'
];
for(const dependency of [false,true]){
  for(const body of mismatchWitnesses)test('refuse reproduced cross-host streaming divergence '+dependency+' '+body,()=>{
    assert.throws(()=>compile(body,dependency),/unproved cross-realm text decoding/);
  });
  for(const body of conservativePartial)test('refuse unproved pending-stream state '+dependency+' '+body,()=>{
    assert.throws(()=>compile(body,dependency),/unproved cross-realm text decoding/);
  });
  for(const body of safe)test('retain independently complete or nonstreaming chunks '+dependency+' '+body,()=>{
    assert.deepEqual(compile(body,dependency).privateNames,['protectedOp']);
  });
}
