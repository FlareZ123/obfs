'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {partitionScoSelectedAsyncExports}=require('../src');

/** @param {string} expression @param {boolean} dependency */
function compile(expression,dependency){
  const body='return '+expression+';';
  const options={seed:'sco-textdecoder-wellformed-review-20261127',privateNames:['protectedOp']};
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

const valid=[
  [],[0],[0x7f],[0xc2,0x80],[0xdf,0xbf],[0xe0,0xa0,0x80],
  [0xed,0x9f,0xbf],[0xee,0x80,0x80],[0xef,0xbb,0xbf],
  [0xf0,0x90,0x80,0x80],[0xf4,0x8f,0xbf,0xbf],
  [0x41,0xc3,0xa9,0xe2,0x82,0xac,0xf0,0x9f,0x98,0x80]
];
const invalid=[
  [0x80],[0xbf],[0xc0,0x80],[0xc1,0xbf],[0xc2],[0xc2,0x41],
  [0xe0,0x9f,0xbf],[0xe0,0xa0],[0xed,0xa0,0x80],[0xed,0xbf,0xbf],
  [0xf0,0x8f,0xbf,0xbf],[0xf0,0x90,0x80],[0xf4,0x90,0x80,0x80],
  [0xf5,0x80,0x80,0x80],[0xff],[0x41,0xe2,0x82],[0x00,0x80]
];
for(const dependency of [false,true]){
  for(const asArray of [false,true]){
    for(const bytes of valid){
      const input=asArray?'new Uint8Array(['+bytes.join(',')+'])':'Uint8Array.of('+bytes.join(',')+')';
      const expression="new TextDecoder('utf-8',{fatal:true}).decode("+input+")";
      test('wellformed literal is admitted '+JSON.stringify({dependency,asArray,bytes}),()=>{
        assert.deepEqual(compile(expression,dependency).privateNames,['protectedOp']);
      });
    }
    for(const bytes of invalid){
      const input=asArray?'new Uint8Array(['+bytes.join(',')+'])':'Uint8Array.of('+bytes.join(',')+')';
      const expression="new TextDecoder('utf-8',{fatal:true}).decode("+input+")";
      test('malformed literal is refused '+JSON.stringify({dependency,asArray,bytes}),()=>{
        assert.throws(()=>compile(expression,dependency),/unproved cross-realm text decoding/);
      });
    }
  }
  test('no-argument fatal decode is admitted '+dependency,()=>{
    assert.deepEqual(compile("new TextDecoder('utf-8',{fatal:true}).decode()",dependency).privateNames,['protectedOp']);
  });
  test('fatal streaming remains refused '+dependency,()=>{
    assert.throws(()=>compile("new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.of(65),{stream:true})",dependency),/unproved cross-realm text decoding/);
  });
  test('nonfatal malformed bytes remain admitted '+dependency,()=>{
    assert.deepEqual(compile("new TextDecoder('utf-8').decode(Uint8Array.of(0xed,0xa0,0x80))",dependency).privateNames,['protectedOp']);
  });
}
