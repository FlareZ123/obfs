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

test('SCO refuses constructor recapture from direct and aliased Blob.slice() results',()=>{
  assert.equal(new Blob([]).slice().constructor,Blob);
  const prefixes=[
    "const Ctor=new Blob([]).slice().constructor;",
    "const sliced=new Blob([]).slice();const Ctor=sliced.constructor;",
    "const Ctor=new Blob([]).slice().slice().constructor;"
  ];
  for(const prefix of prefixes){
    const body=prefix+"const part=new Ctor(['A\\nB'],{endings:'native'});"+
      "return Array.from(new Uint8Array(await part.arrayBuffer()));";
    assert.throws(()=>compile(body),TypeError,prefix);
  }
});

test('SCO permits an ordinary stable scalar size from Blob.slice()',()=>{
  assert.deepEqual(compile(
    "return new Blob(['A']).slice(0,1).size;"
  ).privateNames,['protectedOp']);
});

test('native Blob method values expose their host-dependent function source',()=>{
  const method=new Blob([]).slice;
  assert.equal(typeof method,'function');
  assert.match(String(method),/slice/u);
  assert.ok(String(method).length>10);
});

test('SCO refuses first-class Blob instance methods with unproved source identity',()=>{
  const bodies=[
    "const method=new Blob([]).slice;return String(method).slice(0,60);",
    "return String(new Blob([]).text).slice(0,60);",
    "const b=new Blob([]);const fn=b.arrayBuffer;return String(fn).slice(0,60);"
  ];
  for(const body of bodies)assert.throws(()=>compile(body),TypeError,body);
});

test('native Blob.stream returns a host ReadableStream constructor',()=>{
  const stream=new Blob([]).stream();
  assert.equal(stream.constructor,ReadableStream);
  assert.match(String(stream.constructor),/ReadableStream/u);
  assert.ok(String(stream.constructor).length>20);
});

test('SCO refuses unproved Blob.stream result constructor source',()=>{
  const body="return String(new Blob([]).stream().constructor).slice(0,80);";
  assert.throws(()=>compile(body),TypeError);
});

test('SCO retains direct Blob.text() scalar extraction',()=>{
  const result=compile("return await new Blob(['A']).text();");
  assert.deepEqual(result.privateNames,['protectedOp']);
});
