'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {partitionScoSelectedAsyncExports}=require('../src');

/**
 * Attempt to move one async export to the server while keeping the other
 * export in the original client realm.
 * @param {string} privateBody
 * @param {string} [publicBody]
 * @returns {ReturnType<typeof partitionScoSelectedAsyncExports>}
 */
function partition(privateBody,publicBody='return Math.__obfsRealmAliasCanary??0;'){
  const code='export async function privateOp(){'+privateBody+'}\n'+
    'export function publicRead(){'+publicBody+'}\n';
  return partitionScoSelectedAsyncExports(
    {path:'global-alias.mjs',code,sourceType:'module'},
    {privateNames:['privateOp'],seed:'global-alias-realm-20261115'});
}

test('SCO must refuse globalThis aliases mutating cross-realm intrinsic state',()=>{
  const mutations=[
    'const root=globalThis;root.Math.__obfsRealmAliasCanary=41;',
    'const base=globalThis;const root=base;root.Math.__obfsRealmAliasCanary=41;',
    'let root;root=globalThis;root.Math.__obfsRealmAliasCanary=41;',
    'const root=globalThis;const Native=root.Math;Native.__obfsRealmAliasCanary=41;',
    'const {Math:Native}=globalThis;Native.__obfsRealmAliasCanary=41;',
    'const root=globalThis;const {Math:Native}=root;Native.__obfsRealmAliasCanary=41;'
  ];
  for(const mutation of mutations){
    const originalRealm=vm.createContext({});
    const clientRealm=vm.createContext({});
    assert.equal(vm.runInContext(mutation+'Math.__obfsRealmAliasCanary',originalRealm),41);
    assert.equal(vm.runInContext('Math.__obfsRealmAliasCanary??0',clientRealm),0);
    assert.throws(()=>partition(mutation+'return 1;'),
      /realm-local intrinsic state/i,mutation);
  }
});

test('SCO must refuse transitive global aliases to JSON and RegExp state',()=>{
  const originalRealm=vm.createContext({});
  const clientRealm=vm.createContext({});
  const jsonWrite='const root=globalThis;const Native=root.JSON;Native.__obfsRealmAliasCanary=41;';
  assert.equal(vm.runInContext(jsonWrite+'JSON.__obfsRealmAliasCanary',originalRealm),41);
  assert.equal(vm.runInContext('JSON.__obfsRealmAliasCanary??0',clientRealm),0);
  assert.throws(()=>partition(jsonWrite+'return 1;',
    'return JSON.__obfsRealmAliasCanary??0;'),/realm-local intrinsic state/i);

  const privateMatch='return /(XY)(Z)/.test("XYZ");';
  const publicRead='const root=globalThis;const RX=root.RegExp;return RX.$1;';
  const native=vm.createContext({});
  const moved=vm.createContext({});
  assert.equal(vm.runInContext('/(XY)(Z)/.test("XYZ");RegExp.$1',native),'XY');
  assert.equal(vm.runInContext('RegExp.$1',moved),'');
  assert.throws(()=>partition(privateMatch,publicRead),/realm-local RegExp match/i);
});

test('SCO still admits read-only global aliases without cross-realm mutations',()=>{
  const result=partition('const root=globalThis;return root.Math.PI;',
    'return Math.PI+Number.MAX_SAFE_INTEGER;');
  assert.ok(result.clientFile.code.includes('Math.PI'));
  assert.deepEqual(result.privateNames,['privateOp']);
  assert.deepEqual(result.publicNames,['publicRead']);
});
