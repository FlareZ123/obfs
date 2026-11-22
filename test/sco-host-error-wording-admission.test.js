'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {partitionScoSelectedAsyncExports}=require('../src');

/** @param {string} body @returns {ReturnType<typeof partitionScoSelectedAsyncExports>} */
function compile(body){
  return partitionScoSelectedAsyncExports({
    path:'host-error-wording.mjs',
    sourceType:'module',
    code:'export async function protectedOp(){'+body+
      '}export function visible(){return 7;}'
  },{
    seed:'sco-host-native-error-messages-20261122',
    privateNames:['protectedOp']
  });
}

test('SCO refuses caught invalid-URL native error wording',()=>{
  const source="try{new URL('%%%');return 'unexpected';}"+
    "catch(error){return error.message;}";
  assert.throws(()=>compile(source),TypeError);
});

test('SCO refuses caught invalid-atob native error wording',()=>{
  const source="try{atob('bad?');return 'unexpected';}"+
    "catch(error){return error.message;}";
  assert.throws(()=>compile(source),TypeError);
});

test('SCO already refuses invalid TextDecoder label error wording',()=>{
  const source="try{new TextDecoder('not-a-charset');return 'unexpected';}"+
    "catch(error){return error.message;}";
  assert.throws(()=>compile(source),TypeError);
});

test('SCO retains constant known-valid host API primitive positives',()=>{
  const cases=[
    "return atob('QQ==');",
    "return new URL('https://example.com/a').pathname;",
    "return new TextDecoder('utf-8').decode(new Uint8Array([65]));"
  ];
  for(const source of cases){
    assert.deepEqual(compile(source).privateNames,['protectedOp'],source);
  }
});
