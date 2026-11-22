'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {partitionScoSelectedAsyncExports}=require('../src');

/** @param {string} body @returns {ReturnType<typeof partitionScoSelectedAsyncExports>} */
function compile(body){
  return partitionScoSelectedAsyncExports({
    path:'blob-construct-get.mjs',
    sourceType:'module',
    code:'export async function protectedOp(){'+body+
      '}export function visible(){return 7;}'
  },{
    seed:'sco-reflect-get-blob-constructor-20261122',
    privateNames:['protectedOp']
  });
}

test('Reflect.get on a Blob instance recovers its genuine host constructor',async()=>{
  const instance=new Blob([]);
  const ctor=Reflect.get(instance,'constructor');
  assert.equal(ctor,Blob);
  const reflected=new ctor(['A\nB'],{endings:'native'});
  assert.deepEqual(Array.from(new Uint8Array(await reflected.arrayBuffer())),
    process.platform==='win32'?[65,13,10,66]:[65,10,66]);
});

test('SCO refuses unproved Blob instance constructor extraction through Reflect.get',()=>{
  const bodies=[
    "const Ctor=Reflect.get(new Blob([]),'constructor');"+
      "const part=new Ctor(['A\\nB'],{endings:'native'});"+
      "return Array.from(new Uint8Array(await part.arrayBuffer()));",
    "const base=new Blob([]);const Ctor=Reflect.get(base,'constructor');"+
      "const part=new Ctor(['A\\nB'],{endings:'native'});"+
      "return Array.from(new Uint8Array(await part.arrayBuffer()));"
  ];
  for(const body of bodies)assert.throws(()=>compile(body),TypeError,body);
});

test('SCO already declines a directly obtained instance.constructor',()=>{
  assert.throws(()=>compile(
    "const Ctor=new Blob([]).constructor;return new Ctor(['A']).size;"
  ),TypeError);
});

test('SCO keeps the existing direct transparent Blob construction positive',()=>{
  assert.deepEqual(compile(
    "return new Blob(['A'],{endings:'transparent'}).size;"
  ).privateNames,['protectedOp']);
});

test('SCO refuses constructor recapture from a Blob.slice() result',()=>{
  assert.equal(new Blob([]).slice().constructor,Blob);
  const body="const Ctor=new Blob([]).slice().constructor;"+
    "const part=new Ctor(['A\\nB'],{endings:'native'});"+
    "return Array.from(new Uint8Array(await part.arrayBuffer()));";
  assert.throws(()=>compile(body),TypeError);
});

test('SCO permits an ordinary stable scalar size from Blob.slice()',()=>{
  assert.deepEqual(compile(
    "return new Blob(['A']).slice(0,1).size;"
  ).privateNames,['protectedOp']);
});
