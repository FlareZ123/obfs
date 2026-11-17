'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {lowerWasmI32Functions}=require('../src/wasm-i32');
const {obfuscateFiles}=require('../src/core');

/** @param {string} source @returns {unknown} */
function load(source){
  const module={exports:undefined};
  vm.runInNewContext(source,{module,globalThis},{timeout:3000});
  return module.exports;
}

const cases=[
  {name:'String.raw substitution',tail:
    'module.exports=String.raw({raw:["",""]},f).includes("a^17");'},
  {name:'String.raw static first raw segment',tail:
    'module.exports=String.raw({raw:[f]}).includes("a^17");'},
  {name:'String.raw tagged-template substitution',tail:
    'module.exports=String.raw`before${f}after`.includes("a^17");'},
  {name:'String.raw detached alias',tail:
    'const raw=String.raw;module.exports=raw({raw:["",""]},f).includes("a^17");'},
  {name:'String.raw reflective apply',tail:
    'module.exports=Reflect.apply(String.raw,null,[{raw:["",""]},f]).includes("a^17");'},
  {name:'String Symbol.iterator direct',tail:
    'module.exports=Array.from(String.prototype[Symbol.iterator].call(f)).join("").includes("a^17");'},
  {name:'String Symbol.iterator alias',tail:
    'const iter=String.prototype[Symbol.iterator];module.exports=Array.from(iter.call(f)).join("").includes("a^17");'},
  {name:'String Symbol.iterator bound',tail:
    'const iter=String.prototype[Symbol.iterator].bind(f);module.exports=Array.from(iter()).join("").includes("a^17");'},
  {name:'String Symbol.iterator reflective',tail:
    'module.exports=Array.from(Reflect.apply(String.prototype[Symbol.iterator],f,[])).join("").includes("a^17");'},
  {name:'String.raw destructured method',tail:
    'const {raw}=String;module.exports=raw({raw:["",""]},f).includes("a^17");'},
  {name:'String iterator destructured method',tail:
    'const {[Symbol.iterator]:iter}=String.prototype;module.exports=Array.from(iter.call(f)).join("").includes("a^17");'},
  {name:'String alias raw method destructuring',tail:
    'const S=String;const {raw}=S;module.exports=raw({raw:["",""]},f).includes("a^17");'},
  {name:'String alias iterator destructuring',tail:
    'const S=String;const {[Symbol.iterator]:iter}=S.prototype;module.exports=Array.from(iter.call(f)).join("").includes("a^17");'},
  {name:'String global-destructured alias raw method',tail:
    'const {String:S}=globalThis;const {raw}=S;module.exports=raw({raw:["",""]},f).includes("a^17");'}
];

test('String.raw and String Symbol.iterator retain original function-source bytes',()=>{
  for(const item of cases){
    const source='function f(a){return a^17;}'+item.tail;
    assert.equal(load(source),true,'The native fixture must see source: '+item.name);
    const emitted=lowerWasmI32Functions(source,'commonjs',{
      seed:'string-static-coercion-'+item.name,names:['f']
    });
    assert.equal(emitted.functions,0,'Unsafe rewrite: '+item.name);
    assert.equal(emitted.declined,1,'Must report declined: '+item.name);
    assert.equal(emitted.code,source,'Must preserve exact source: '+item.name);
  }
});

test('String.raw with known primitive substitutions preserves genuine Wasm lowering',()=>{
  const source='function f(a){return a^17;}module.exports=['+
    'f(3),String.raw({raw:["before","after"]},"literal"),'+
    'Array.from(String.prototype[Symbol.iterator].call("literal")).join("")];';
  const emitted=lowerWasmI32Functions(source,'commonjs',{
    seed:'string-static-primitive-positive',names:['f']
  });
  assert.equal(emitted.functions,1);
  assert.equal(emitted.declined,0);
  assert.deepEqual(Array.from(/** @type {unknown[]} */(load(emitted.code))),
    Array.from(/** @type {unknown[]} */(load(source))));
});


test('native String.raw constructor alias on primitive preserves Wasm lowering',()=>{
  const code='function f(a){return a^17;}'+
    'const S=String;const {raw}=S;'+
    'module.exports=[f(3),raw({raw:["left","right"]},"safe")];';
  const output=lowerWasmI32Functions(code,'commonjs',{
    seed:'string-raw-alias-primitive-positive',names:['f']
  });
  assert.equal(output.functions,1);
  assert.equal(output.declined,0);
  assert.deepEqual(Array.from(/** @type {unknown[]} */(load(output.code))),
    Array.from(/** @type {unknown[]} */(load(code))));
});

test('ESM imported function consumed by String.raw fails closed',()=>{
  /** @type {import('../src/core').SourceFile[]} */
  const files=[
    {path:'private.mjs',sourceType:'module',
      code:'export function f(a){return a^17;}'},
    {path:'public.mjs',sourceType:'module',
      code:'import {f} from "./private.mjs";export const seen=String.raw({raw:["",""]},f).includes("a^17");'}
  ];
  assert.throws(()=>obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'string-raw-crossfile',strings:false,
    experimentalWasmI32:{'private.mjs':['f']}
  }),/Wasm i32 requires a module\/CommonJS without cross-file source observation/u);
});
