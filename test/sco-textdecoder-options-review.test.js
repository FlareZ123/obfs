'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {partitionScoSelectedAsyncExports}=require('../src');

/** @param {string} body */
function compile(body){
  return partitionScoSelectedAsyncExports({
    path:'decoder-options.mjs',
    sourceType:'module',
    code:'export async function protectedOp(){'+body+'}\nexport function visible(){return 7;}'
  },{
    seed:'sco-decoder-options-review-20261127',
    privateNames:['protectedOp']
  });
}

// Native Node 22.16 and Chromium 144 disagree on error diagnostics for
// non-dictionary constructor options; primitive decode options differ
// even in success vs throw. ASCII data does not prove options conversion.
for(const value of ['0','"x"','true']){
  test('reject primitive TextDecoder constructor option '+value,()=>{
    assert.throws(()=>compile('return new TextDecoder("utf-8",'+value+').decode(Uint8Array.of(65));'),TypeError);
  });
  test('reject primitive TextDecoder.decode option '+value,()=>{
    assert.throws(()=>compile('return new TextDecoder().decode(Uint8Array.of(65),'+value+');'),TypeError);
  });
}
test('reject primitive constructor options even on a scalar getter',()=>{
  assert.throws(()=>compile('return new TextDecoder("utf-8",0).encoding;'),TypeError);
});
for(const body of [
  'return new TextDecoder().decode(Uint8Array.of(65));',
  'return new TextDecoder("utf-8",{fatal:true}).decode(Uint8Array.of(65));',
  'return new TextDecoder().decode(Uint8Array.of(128));',
  'return new TextDecoder("utf-8",{}).encoding;',
  'return new TextDecoder().decode(Uint8Array.of(65),{stream:false});'
]){
  test('retain safe decoder control: '+body,()=>{
    assert.deepEqual(compile(body).privateNames,['protectedOp']);
  });
}

/** @param {string} body */
function compileDependency(body){
  return partitionScoSelectedAsyncExports({
    path:'entry.mjs',sourceType:'module',
    code:'import {read} from "./private/decoder.mjs";export async function protectedOp(){return read();}export function visible(){return 7;}'
  },{
    seed:'sco-decoder-options-static-dependency-20261127',
    privateNames:['protectedOp'],privateModuleImports:['./private/decoder.mjs'],
    privateModuleSources:[{path:'private/decoder.mjs',code:'export function read(){'+body+'}'}]
  });
}

const moreRefusals=[
  'return new TextDecoder("utf-8",{__proto__:{fatal:true}}).decode(Uint8Array.of(128));',
  'const options={fatal:false};return new TextDecoder("utf-8",options).decode(Uint8Array.of(65));',
  'const options={stream:false};return new TextDecoder().decode(Uint8Array.of(65),options);',
  'return new TextDecoder("utf-8",{get fatal(){return true;}}).encoding;',
  'return new TextDecoder("utf-8",{fatal:1}).decode(Uint8Array.of(65));',
  'return new TextDecoder().decode(Uint8Array.of(65),{stream:1});',
  // A split scalar is valid in isolation but is not a complete-chunk proof.
  'const d=new TextDecoder();const alias=d;return alias.decode(Uint8Array.of(226),{stream:true})+alias.decode(Uint8Array.of(130,172));',
  'return new TextDecoder("utf-8",0).decode(Uint8Array.of(65));',
  'return new TextDecoder().decode(Uint8Array.of(65),0);'
];
for(const body of moreRefusals){
  test('refuse unproved options in selected root and private dependency: '+body,()=>{
    assert.throws(()=>compile(body),TypeError);
    assert.throws(()=>compileDependency(body),TypeError);
  });
}
const morePositives=[
  'return new TextDecoder("utf-8",null).decode(Uint8Array.of(128),null);',
  'return new TextDecoder("utf-8",{["fatal"]:false}).decode(Uint8Array.of(128));',
  'const d=new TextDecoder();const alias=d;return alias.decode(Uint8Array.of(226,130,172),{stream:true})+alias.decode(Uint8Array.of(65));',
  'return new TextDecoder("utf-8",{ignoreBOM:true}).ignoreBOM;',
  'return new TextDecoder("utf-8",{fatal:true}).decode(Uint8Array.of(65));'
];
for(const body of morePositives){
  test('retain explicit dictionary controls in selected root and dependency: '+body,()=>{
    assert.deepEqual(compile(body).privateNames,['protectedOp']);
    assert.deepEqual(compileDependency(body).privateNames,['protectedOp']);
  });
}
