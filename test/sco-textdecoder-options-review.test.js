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
