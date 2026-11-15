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

test('SCO refuses first-class reflective methods and immutable constructor aliases',()=>{
  const aliases=[
    "const reflect=Object.getOwnPropertyDescriptor;reflect(Object,'prototype').value.__obfsRealmCanary=41;",
    "const reflect=Reflect.get;reflect(Object,'prototype').__obfsRealmCanary=41;",
    "const alias=Reflect;alias.get(Object,'prototype').__obfsRealmCanary=41;",
    "const alias=Object;Reflect.get(alias,'prototype').__obfsRealmCanary=41;",
    "const alias=Object;const key='prototype';alias[key].__obfsRealmCanary=41;",
    "const alias=globalThis.Object;Reflect.get(alias,'prototype').__obfsRealmCanary=41;",
    "const {get:reflect}=Reflect;reflect(Object,'prototype').__obfsRealmCanary=41;",
    "const {getOwnPropertyDescriptor:reflect}=Object;reflect(Object,'prototype').value.__obfsRealmCanary=41;",
    "const {getOwnPropertyDescriptors:reflect}=Object;reflect(Object).prototype.value.__obfsRealmCanary=41;"
  ];
  for(const body of aliases){
    assert.throws(()=>partition(moduleSource(body+'return 1;')),
      /realm.*prototype|prototype.*realm/i,body);
  }
});

test('SCO split must refuse legacy RegExp match state shared between exports',()=>{
  const first=vm.createContext({});
  const second=vm.createContext({});
  assert.equal(vm.runInContext('/(XY)(Z)/.test("XYZ");RegExp.$1',first),'XY');
  assert.equal(vm.runInContext('RegExp.$1',second),'');
  assert.equal(vm.runInContext('RegExp.$1',first),'XY');
  const privateMatch='return /(XY)(Z)/.test("XYZ");';
  for(const publicRead of [
    'return RegExp.$1;',
    'return RegExp.lastMatch;',
    'const Rx=RegExp;return Rx["$"+"1"];',
    'const Rx=RegExp;return Rx.input;'
  ]){
    assert.throws(()=>partition(moduleSource(privateMatch,publicRead)),
      /realm.*regexp|regexp.*realm/i,publicRead);
  }
});

test('SCO refuses writes to realm-specific intrinsic static objects',()=>{
  for(const [write,read,expected] of [
    ['Math.__obfsRealmCanary=41','Math.__obfsRealmCanary','41'],
    ['JSON.__obfsRealmCanary=41','JSON.__obfsRealmCanary','41'],
    ['Error.stackTraceLimit=0','Error.stackTraceLimit','0']
  ]){
    const one=vm.createContext({});
    const two=vm.createContext({});
    assert.equal(String(vm.runInContext(write+';'+read,one)),expected);
    assert.notEqual(String(vm.runInContext(read,two)),expected);
    assert.throws(()=>partition(moduleSource(write+';return 1;','return '+read+';')),
      /realm.*intrinsic|intrinsic.*realm/i,write);
  }
  const aliases=[
    'const M=Math;M.__obfsRealmCanary=41;',
    'const E=Error;E.stackTraceLimit=0;',
    'const J=globalThis.JSON;J.__obfsRealmCanary=41;',
    'Object.assign(Math,{__obfsRealmCanary:41});'
  ];
  for(const write of aliases){
    assert.throws(()=>partition(moduleSource(write+'return 1;')),
      /realm.*intrinsic|intrinsic.*realm/i,write);
  }
});

test('SCO refuses 32 static-intrinsic mutation spellings and retains read-only math',()=>{
  for(const root of ['Object','Array','Math','JSON','Error','RegExp','Intl','Promise']){
    const mutations=[
      root+'.__obfsRealmCanary=41;',
      'const Native='+root+';Native.__obfsRealmCanary=41;',
      'const First='+root+';const Second=First;Second["__obfsRealmCanary"]=41;',
      'const Native=globalThis.'+root+';Native.__obfsRealmCanary=41;'
    ];
    for(const mutation of mutations){
      const code=moduleSource(mutation+'return 1;','return '+root+'.__obfsRealmCanary??0;');
      assert.throws(()=>partition(code),/realm.*intrinsic|intrinsic.*realm/i,mutation);
    }
  }
  const readOnly=moduleSource('return 1;','return Math.PI+Number.MAX_SAFE_INTEGER;');
  const result=partition(readOnly);
  assert.match(result.clientFile.code,/Math.PI/);
  assert.match(result.clientFile.code,/Number.MAX_SAFE_INTEGER/);
});

test('SCO private export cannot silently migrate browser-only ambient reads',()=>{
  const browser=vm.createContext({window:{externalBridge:{value:41}}});
  const server=vm.createContext({});
  assert.equal(vm.runInContext('window.externalBridge.value',browser),41);
  assert.throws(()=>vm.runInContext('window.externalBridge.value',server),/window is not defined/);
  for(const expression of [
    'window.externalBridge.value',
    'document.title',
    'navigator.language',
    'location.href',
    'localStorage.length',
    'sessionStorage.length',
    'indexedDB.open("x")',
    'globalThis.window.externalBridge.value',
    'globalThis["doc"+"ument"].title',
    'typeof window'
  ]){
    const source=moduleSource('return '+expression+';','return 7;');
    assert.throws(()=>partition(source),/browser.*ambient|ambient.*browser/i,expression);
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
