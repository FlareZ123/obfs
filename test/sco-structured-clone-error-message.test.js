'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {partitionScoSelectedAsyncExports}=require('../src');

/** @param {string} body @returns {ReturnType<typeof partitionScoSelectedAsyncExports>} */
function compile(body){
  return partitionScoSelectedAsyncExports({
    path:'clone-error-source.mjs',
    sourceType:'module',
    code:'export async function protectedOp(){'+body+
      '}export function visible(){return 7;}'
  },{
    seed:'sco-structured-clone-native-error-20261122',
    privateNames:['protectedOp']
  });
}

test('native structuredClone function rejection has an observable DataCloneError message',()=>{
  assert.throws(()=>structuredClone(()=>7),error=>
    error instanceof DOMException&&error.name==='DataCloneError'&&
    /could not be cloned/u.test(error.message));
});

test('SCO refuses a caught native structuredClone rejection message',()=>{
  const body='try{structuredClone(()=>7);return "unexpected";}'+
    'catch(error){return error.message;}';
  assert.throws(()=>compile(body),TypeError);
});

test('SCO preserves primitive and directly owned JSON-literal structuredClone cases',()=>{
  const bodies=[
    'return structuredClone(7);',
    "return structuredClone({safe:7,parts:['A',true,null]}).safe;",
    "return structuredClone(['A',5])[1];"
  ];
  for(const body of bodies){
    assert.deepEqual(compile(body).privateNames,['protectedOp'],body);
  }
});
