'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {partitionScoSelectedAsyncExports}=require('../src');

/** @param {string} privateBody @param {string} [publicBody] */
function source(privateBody,publicBody='return 7;'){
  return 'export async function protectedOp(){'+privateBody+'}\n'+
    'export function visible(){'+publicBody+'}\n';
}

/** @param {string} privateBody @param {string} [publicBody] */
function partition(privateBody,publicBody){
  return partitionScoSelectedAsyncExports(
    {path:'custom-ambient.mjs',code:source(privateBody,publicBody),sourceType:'module'},
    {privateNames:['protectedOp'],seed:'custom-ambient-20261116'});
}

test('Native custom browser-owned global is absent in independent server realm',()=>{
  const browser=vm.createContext({externalBridge:{value:41}});
  const server=vm.createContext({});
  assert.equal(vm.runInContext('globalThis.externalBridge.value',browser),41);
  assert.equal(vm.runInContext('typeof globalThis.externalBridge',server),'undefined');
  assert.throws(()=>vm.runInContext('globalThis.externalBridge.value',server),/Cannot read properties of undefined/);
});

test('SCO private extraction refuses unknown host-global application properties',()=>{
  const bodies=[
    'return globalThis.externalBridge.value;',
    'return globalThis.customConfig;',
    "return globalThis['externalBridge'].value;",
    'const root=globalThis;return root.externalBridge.value;',
    'const root=globalThis;const alias=root;return alias.customConfig;',
    'return globalThis.externalBridge?.value;',
    'return typeof globalThis.externalBridge;',
    "const {externalBridge:bridge}=globalThis;return bridge.value;",
    "const root=globalThis;const key='externalBridge';return root[key].value;"
  ];
  for(const body of bodies){
    assert.throws(()=>partition(body),/Private SCO export uses unproved host-global state|Private SCO export uses browser-only ambient state/,
      body);
  }
});

test('SCO admits deterministic standard global access and lexical local objects',()=>{
  for(const body of [
    'return globalThis.Math.imul(7,9);',
    'return globalThis.Number.isFinite(41);',
    'return Math.PI;',
    'const local={externalBridge:41};return local.externalBridge;',
    'const globalThis={externalBridge:{value:41}};return globalThis.externalBridge.value;'
  ]){
    const emitted=partition(body);
    assert.deepEqual(emitted.privateNames,['protectedOp'],body);
  }
  const emitted=partition('return 7;','return globalThis.externalBridge.value;');
  assert.match(emitted.clientFile.code,/globalThis.externalBridge.value/);
});

test('Cross-boundary ambient access retains the established refusal diagnostic',()=>{
  assert.throws(()=>partition(
    'return globalThis.sharedState;',
    'return globalThis.sharedState;'),/share ambient state/u);
});

test('SCO rejects alternate global-object paths and identity escapes',()=>{
  for(const body of [
    'return globalThis.globalThis.externalBridge.value;',
    'const root=globalThis.globalThis;return root.externalBridge.value;',
    'const {globalThis:root}=globalThis;return root.externalBridge.value;',
    'const {globalThis:{externalBridge:bridge}}=globalThis;return bridge.value;',
    'return globalThis.globalThis;',
    'const root=globalThis;return root.globalThis.externalBridge.value;'
  ]){
    assert.throws(()=>partition(body),
      /unproved host-global state|browser-only ambient state|realm-local intrinsic state/u,body);
  }
});

test('Independent local globalThis bindings in private and public exports are separate',()=>{
  const original=source(
    'const globalThis={privateValue:41};return globalThis.privateValue;',
    'const globalThis={publicValue:7};return globalThis.publicValue;');
  const emitted=partitionScoSelectedAsyncExports(
    {path:'local-shadow.mjs',code:original,sourceType:'module'},
    {privateNames:['protectedOp'],seed:'local-shadow-regression-20261116'});
  assert.deepEqual(emitted.privateNames,['protectedOp']);
  assert.deepEqual(emitted.publicNames,['visible']);
  assert.match(emitted.clientFile.code,/globalThis.publicValue/u);
});

test('Local-window records avoid false shared-ambient refusal, while genuine roots remain guarded',()=>{
  const safe=partitionScoSelectedAsyncExports(
    {path:'local-window.mjs',sourceType:'module',code:source(
      'const window={privateValue:41};return window.privateValue;',
      'const window={publicValue:7};return window.publicValue;')},
    {privateNames:['protectedOp'],seed:'local-window-proof-20261116'});
  assert.deepEqual(safe.privateNames,['protectedOp']);
  assert.match(safe.clientFile.code,/window.publicValue/u);
  assert.throws(()=>partition(
    'return globalThis.Math.PI;',
    'return globalThis.Math.PI;'),/share ambient state/u);
  assert.throws(()=>partition(
    'const globalThis=probe();return globalThis.Math.PI;',
    'return globalThis.Math.PI;'),/share ambient state|unproved host-global state|realm-local/u);
});
