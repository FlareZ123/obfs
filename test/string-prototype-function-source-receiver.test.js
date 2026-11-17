'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {lowerWasmI32Functions}=require('../src/wasm-i32');
const {obfuscateFiles}=require('../src/core');

/** @param {string} source @returns {unknown} */
function evaluate(source){
  const module={exports:null};
  vm.runInNewContext(source,{module,globalThis},{timeout:3000});
  return module.exports;
}

const consumers=[
  {name:'String.prototype.includes.call',suffix:
    'module.exports=String.prototype.includes.call(f,"a^17");'},
  {name:'String.prototype.slice.call',suffix:
    'module.exports=String.prototype.slice.call(f);'},
  {name:'aliased String prototype method',suffix:
    'const method=String.prototype.includes;module.exports=method.call(f,"a^17");'},
  {name:'bound String prototype method',suffix:
    'const bound=String.prototype.includes.bind(f);module.exports=bound("a^17");'},
  {name:'Reflect.apply native String method',suffix:
    'module.exports=Reflect.apply(String.prototype.includes,f,["a^17"]);'},
  {name:'native String.prototype.match.call',suffix:
    'module.exports=String.prototype.match.call(f,/a\\^17/)?.[0]??null;'}
];

test('native String prototype generic methods can stringify a function receiver',()=>{
  for(const entry of consumers){
    const source='function f(a){return a^17;}'+entry.suffix;
    const native=evaluate(source);
    assert.ok(native,'Fixture must observe original Function source: '+entry.name);
    const lowered=lowerWasmI32Functions(source,'commonjs',{
      seed:'string-receiver-'+entry.name,names:['f']
    });
    assert.equal(lowered.functions,0,'Must decline source rewrite: '+entry.name);
    assert.equal(lowered.declined,1,'Must report decline: '+entry.name);
    assert.equal(lowered.code,source,'Must preserve source spelling: '+entry.name);
    assert.deepEqual(evaluate(lowered.code),native);
  }
});

test('Wasm compiler can still rewrite a function if String prototype receiver is primitive',()=>{
  const source='function f(a){return a^17;}module.exports=[f(3),'+
    'String.prototype.includes.call("a^17","a^17")];';
  const lowered=lowerWasmI32Functions(source,'commonjs',{
    seed:'string-receiver-primitive-positive',names:['f']
  });
  assert.equal(lowered.functions,1);
  assert.equal(lowered.declined,0);
  assert.deepEqual(Array.from(/** @type {unknown[]} */(evaluate(lowered.code))),
    Array.from(/** @type {unknown[]} */(evaluate(source))));
});

test('closed ESM consumers of native String method on imported function require fail-closed rewriting',()=>{
  /** @type {import('../src/core').SourceFile[]} */
  const files=[
    {path:'numeric.mjs',sourceType:'module',code:'export function f(a){return a^17;}'},
    {path:'entry.mjs',sourceType:'module',
      code:'import {f} from "./numeric.mjs";export const seen=String.prototype.includes.call(f,"a^17");'}
  ];
  assert.throws(()=>obfuscateFiles(files,{
    mode:'coo',seed:'string-ESM-source-consumer',closedWorld:true,
    strings:false,experimentalWasmI32:{'numeric.mjs':['f']}
  }),/Wasm i32 requires a module\/CommonJS without cross-file source observation/u);
});
