'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {partitionScoSelectedAsyncExports}=require('../src');

/**
 * @param {string} body
 * @returns {ReturnType<typeof partitionScoSelectedAsyncExports>}
 */
function partition(body){
  const code='export async function privateOp(){'+body+'}'+String.fromCharCode(10)+
    'export function publicRead(){return 7;}'+String.fromCharCode(10);
  return partitionScoSelectedAsyncExports(
    {path:'error-carrier-realm.mjs',sourceType:'module',code},
    {privateNames:['privateOp'],seed:'error-carrier-realm-20261117'});
}

test('SCO refuses native Error stack extraction through first-class carriers',()=>{
  const bodies=[
    "const err=new Error('tag');return ({err}).err.stack;",
    "const err=new Error('tag');const box=[err];return box[0].stack;",
    "function grab(value){return value.stack;}return grab(new Error('tag'));",
    "const err=new Error('tag');const p=new Proxy(err,{get(target,key){return target[key];}});return p.stack;"
  ];
  for(const body of bodies){
    const expr='(()=>{'+body+'})()';
    const client=vm.runInNewContext(expr,{}, {filename:'client.mjs'});
    const server=vm.runInNewContext(expr,{}, {filename:'server-private-long.mjs'});
    assert.equal(typeof client,'string',body);
    assert.match(client,/client\\.mjs/,body);
    assert.match(server,/server-private-long\\.mjs/,body);
    assert.notEqual(client,server,body);
    assert.throws(()=>partition(body),/realm-local error stack/i,body);
  }
});

test('SCO preserves direct stable Error values and local stack records',()=>{
  const bodies=[
    "const err=new Error('tag');return err.message;",
    "function make(){return new Error('tag');}return make().message;",
    "const err=new Error('tag');const alias=err;return alias.name;",
    "const local={stack:'safe'};return local.stack;"
  ];
  for(const body of bodies){
    const partitioned=partition(body);
    assert.deepEqual(partitioned.privateNames,['privateOp'],body);
  }
});
