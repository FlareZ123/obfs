'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {partitionScoSelectedAsyncExports}=require('../src');

/**
 * @param {string} protectedBody
 * @param {string} [visibleBody]
 * @returns {string}
 */
function moduleSource(protectedBody,visibleBody='return ({}).__obfsRealmCanary??0;') {
  return 'export async function protectedOp(){'+protectedBody+'}\n'+
    'export function visible(){'+visibleBody+'}\n';
}

/** @param {string} code */
function partition(code) {
  return partitionScoSelectedAsyncExports(
    {path:'realm.mjs',code,sourceType:'module'},
    {seed:'intrinsic-realm-20261115',privateNames:['protectedOp']}
  );
}

test('SCO selection cannot share realm-local Object.prototype state',()=>{
  const first=vm.createContext({});
  const second=vm.createContext({});
  assert.equal(vm.runInContext(
    'Object.prototype.__obfsRealmCanary=41;({}).__obfsRealmCanary',first),41);
  assert.equal(vm.runInContext('({}).__obfsRealmCanary??0',second),0);
  assert.equal(({}).__obfsRealmCanary,undefined);

  const cases=[
    moduleSource('Object.prototype.__obfsRealmCanary=41;return 1;'),
    moduleSource('const proto=Array.prototype;proto.__obfsRealmCanary=41;return 1;'),
    moduleSource('Object.defineProperty(Object.prototype,"__obfsRealmCanary",{value:41});return 1;'),
    moduleSource('Reflect.getPrototypeOf({}).__obfsRealmCanary=41;return 1;'),
    moduleSource('({}).__proto__.__obfsRealmCanary=41;return 1;'),
    moduleSource('return Object.prototype.__obfsRealmCanary??0;',
      'Object.prototype.__obfsRealmCanary=41;return 41;')
  ];
  for(const code of cases) {
    assert.throws(()=>partition(code),/realm.*prototype|prototype.*realm/i,code);
  }
});

test('SCO selection rejects prototype access hidden in private and public helpers',()=>{
  const privateHelper=[
    'function helper(){const proto=Object.prototype;proto.__obfsRealmCanary=7;return 1;}',
    'export async function protectedOp(){return helper();}',
    'export function visible(){return ({}).__obfsRealmCanary??0;}'
  ].join('\n');
  assert.throws(()=>partition(privateHelper),/realm.*prototype|prototype.*realm/i);

  const publicHelper=[
    'const helper=()=>Array.prototype.__obfsRealmCanary??0;',
    'export async function protectedOp(){return 1;}',
    'export function visible(){return helper();}'
  ].join('\n');
  assert.throws(()=>partitionScoSelectedAsyncExports(
    {path:'realm.mjs',code:publicHelper,sourceType:'module'},
    {seed:'intrinsic-realm-20261115',privateNames:['protectedOp'],
      publicHelperNames:['helper']}
  ),/realm.*prototype|prototype.*realm/i);
});

test('SCO selection declines encoded, reflective and destructured intrinsic prototypes',()=>{
  const roots=[
    "Object.getOwnPropertyDescriptor(Object,'prototype').value",
    "Reflect.get(Object,'prototype')",
    "Object['pro'+'totype']",
    "Object[realmKey]",
    "destructured",
    "({})['__'+'proto__']"
  ];
  for(const value of [7,41,103,7919]){
    for(const root of roots){
      const prefix=root==='destructured' ?
        'const {prototype:proto}=Object;' :
        root==='Object[realmKey]' ?
          "const realmKey='prototype';" : '';
      const owner=root==='destructured'?'proto':root;
      const code=moduleSource(prefix+owner+'.__obfsRealmCanary='+value+';return 1;');
      assert.throws(()=>partition(code),/realm.*prototype|prototype.*realm/i,
        'Expected refusal for '+root+' with value '+value);
    }
  }
});

test('SCO realm safeguard keeps proven independent public/private functions',()=>{
  const safe=moduleSource('const item={privateField:41};return item.privateField;',
    'const item={publicField:7};return item.publicField;');
  const partitioned=partition(safe);
  assert.deepEqual(partitioned.privateNames,['protectedOp']);
  assert.deepEqual(partitioned.publicNames,['visible']);
  assert.ok(partitioned.clientFile.code.includes('export function visible()'));
  assert.ok(partitioned.clientFile.code.includes('return item.publicField;'));
  assert.ok(!partitioned.clientFile.code.includes('privateField'));
});
