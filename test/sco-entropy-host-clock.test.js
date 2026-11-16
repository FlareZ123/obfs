'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {partitionScoSelectedAsyncExports}=require('../src');

/** @param {string} body @param {string} [publicBody] */
function source(body,publicBody='return 7;'){
  return 'export async function protectedOp(){'+body+'}\n'+
    'export function visible(){'+publicBody+'}\n';
}

/** @param {string} privateBody @param {string} [publicBody] */
function partition(privateBody,publicBody){
  return partitionScoSelectedAsyncExports({
    path:'entropy-realm.mjs',sourceType:'module',
    code:source(privateBody,publicBody)
  },{seed:'entropy-realm-20261116',privateNames:['protectedOp']});
}

/** @returns {import('node:vm').Context} */
function countedRealm(){
  const context=vm.createContext({});
  vm.runInContext('let sequence=0;Math.random=()=>++sequence;',context);
  return context;
}

test('Native same-realm random call sequence differs across isolated realms',()=>{
  const native=countedRealm();
  const client=countedRealm();
  const server=countedRealm();
  const nativeCalls=[
    vm.runInContext('Math.random()',native),
    vm.runInContext('Math.random()',native)
  ];
  const separatedCalls=[
    vm.runInContext('Math.random()',server),
    vm.runInContext('Math.random()',client)
  ];
  assert.deepEqual(nativeCalls,[1,2]);
  assert.deepEqual(separatedCalls,[1,1]);
  assert.notDeepEqual(nativeCalls,separatedCalls);
});

test('SCO refuses known private realm-dependent entropy and host-clock reads',()=>{
  const bodies=[
    'return Math.random();',
    'const m=Math;return m.random();',
    'return globalThis.Math.random();',
    'const random=Math.random;return random();',
    'const {random:draw}=Math;return draw();',
    'let draw;({random:draw}=Math);return draw();',
    'const {Math:RandomMath}=globalThis;return RandomMath.random();',
    "return Math['ran'+'dom']();",
    'return crypto.randomUUID();',
    'return globalThis.crypto.randomUUID();',
    'return Array.from(crypto.getRandomValues(new Uint8Array(4)));',
    'const c=crypto;return c.randomUUID();',
    'const c=globalThis.crypto;return c.randomUUID();',
    'const {randomUUID:draw}=crypto;return draw();',
    'const {crypto:host}=globalThis;return host.randomUUID();',
    'let draw;({randomUUID:draw}=crypto);return draw();',
    'return performance.now();',
    'return globalThis.performance.timeOrigin;',
    'const p=performance;return p.now();',
    'const p=globalThis.performance;return p.timeOrigin;',
    'const {now:clock}=performance;return clock();',
    'const {performance:clock}=globalThis;return clock.timeOrigin;',
    'const r=performance.now;return r.call(performance);'
  ];
  for(const body of bodies){
    assert.throws(()=>partition(body),
      /realm-local (?:entropy|clock|intrinsic state)/,body);
  }
});

test('SCO retains deterministic Math controls and client-side randomness',()=>{
  for(const privateBody of [
    'return Math.abs(-7);',
    'return Math.imul(7,9);',
    'return Math.PI;',
    'return 7*9;'
  ]){
    const emitted=partition(privateBody);
    assert.equal(emitted.privateNames[0],'protectedOp',privateBody);
  }
  const emitted=partition('return Math.abs(-7);','return Math.random();');
  assert.match(emitted.clientFile.code,/Math.random/);
});
