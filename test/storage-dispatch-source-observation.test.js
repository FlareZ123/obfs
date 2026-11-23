'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

const common=[
  'function inspect(){const privateLocal=29;return privateLocal;}',
  'function independent(){const independentLocal=7;return independentLocal;}'
];

/** @type {Array<[string,string]>} */
const cases=[
  ['native inherited method',[
    ...common,
    'export function sample(){',
    '  localStorage.setItem("key",inspect);',
    '  return inspect()+independent();',
    '}'
  ].join('\n')],
  ['own Storage instance override',[
    ...common,
    'const captured=new WeakMap();',
    'export function sample(){',
    '  Object.defineProperty(localStorage,"setItem",{configurable:true,writable:true,value:function(_key,value){captured.set(this,value);}});',
    '  localStorage.setItem("key",inspect);',
    '  return captured.get(localStorage)()+independent();',
    '}'
  ].join('\n')],
  ['Storage.prototype override',[
    ...common,
    'const descriptor=Object.getOwnPropertyDescriptor(Storage.prototype,"setItem");',
    'const captured=new WeakMap();',
    'export function sample(){',
    '  Object.defineProperty(Storage.prototype,"setItem",{configurable:true,writable:true,value:function(_key,value){captured.set(this,value);}});',
    '  localStorage.setItem("key",inspect);',
    '  Object.defineProperty(Storage.prototype,"setItem",descriptor);',
    '  return captured.get(localStorage)()+independent();',
    '}'
  ].join('\n')],
  ['captured native method after prototype override',[
    ...common,
    'const descriptor=Object.getOwnPropertyDescriptor(Storage.prototype,"setItem");',
    'const nativeSetItem=descriptor.value;',
    'export function sample(){',
    '  Object.defineProperty(Storage.prototype,"setItem",{configurable:true,writable:true,value:function(_key,_value){}});',
    '  nativeSetItem.call(localStorage,"key",inspect);',
    '  return localStorage.getItem("key")+inspect()+independent();',
    '}'
  ].join('\n')]
];

for(const [name,source] of cases) {
  test('Storage dispatch witness: '+name,()=>{
    // Current main does not resolve the native Storage method identity. This
    // fixture is an expected-red acceptance witness, not a security claim.
    assert.equal(observesFunctionSource(parse(source,'module')),false,name);
    const result=obfuscateFiles([{
      path:'entry.mjs',sourceType:'module',code:source
    }],{
      mode:'coo',
      seed:'storage-dispatch/'+name,
      properties:false,
      identifiers:true,
      strings:false
    });
    const file=result.files[0];
    assert.ok(file);
    const output=String(file.code);
    assert.ok(file.metrics.bindings>=2,'both private locals should currently be rewritten');
    assert.ok(!output.includes('privateLocal'),name);
    assert.ok(!output.includes('independentLocal'),name);
  });
}
