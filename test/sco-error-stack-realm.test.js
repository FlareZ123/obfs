'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {partitionScoSelectedAsyncExports}=require('../src');

/**
 * @param {string} privateBody
 * @returns {ReturnType<typeof partitionScoSelectedAsyncExports>}
 */
function partition(privateBody){
  const code='export async function privateOp(){'+privateBody+'}\n'+
    'export function publicRead(){return 7;}\n';
  return partitionScoSelectedAsyncExports(
    {path:'error-stack-realm.mjs',sourceType:'module',code},
    {privateNames:['privateOp'],seed:'error-stack-realm-20261117'});
}

test('native error stack exposes the original execution file and call site',()=>{
  const code="function recorded(){return new Error('trace').stack;}recorded();";
  const browser=vm.runInNewContext(code,{}, {filename:'browser-client.mjs'});
  const server=vm.runInNewContext(code,{}, {filename:'server-private.mjs'});
  assert.equal(typeof browser,'string');
  assert.equal(typeof server,'string');
  assert.match(browser,/browser-client\.mjs/);
  assert.match(server,/server-private\.mjs/);
  assert.notEqual(browser,server);
});

test('SCO must refuse relocating native stack reads and V8 stack capture',()=>{
  const bodies=[
    "return new Error('tag').stack;",
    "return Error('tag')['stack'];",
    "const err=new Error('tag');return err.stack;",
    "const err=new Error('tag');const alias=err;return alias.stack;",
    "const Native=TypeError;return new Native('tag').stack;",
    "const {Error:E}=globalThis;return E('tag').stack;",
    "const {stack:trace}=new Error('tag');return trace;",
    "const record={};Error.captureStackTrace(record);return record.stack;",
    "const capture=Error.captureStackTrace;const record={};capture(record);return record.stack;"
  ];
  for(const body of bodies){
    const code='(()=>{'+body+'})()';
    const client=vm.runInNewContext(code,{}, {filename:'browser-client.mjs'});
    const server=vm.runInNewContext(code,{}, {filename:'server-private.mjs'});
    assert.equal(typeof client,'string',body);
    assert.match(client,/browser-client\\.mjs/,body);
    assert.match(server,/server-private\\.mjs/,body);
    assert.notEqual(client,server,body);
    assert.throws(()=>partition(body),/realm-local.*stack/i,body);
  }
});

test('SCO retains stable error messages and unrelated local stack fields',()=>{
  const bodies=[
    "return new Error('tag').message;",
    "const err=new Error('tag');return err.name;",
    "return new TypeError('tag').message;",
    "const record={stack:'safe'};return record.stack;",
    "return Error('tag').message;"
  ];
  for(const body of bodies){
    const result=partition(body);
    assert.deepEqual(result.privateNames,['privateOp'],body);
  }
});
