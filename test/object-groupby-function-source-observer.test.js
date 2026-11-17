'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {lowerWasmI32Functions}=require('../src/wasm-i32');
const {obfuscateFiles}=require('../src/core');

/** @param {string} source @returns {unknown} */
function load(source){
  const module={exports:undefined};
  vm.runInNewContext(source,{module},{timeout:3000});
  return module.exports;
}

const consumers=[
  {name:'direct arrow returns protected function',
    tail:'module.exports=Object.keys(Object.groupBy([1],()=>f))[0].includes("a^17");'},
  {name:'named function callback returns protected function',
    tail:'function choose(){return f;}module.exports=Object.keys(Object.groupBy([1],choose))[0].includes("a^17");'},
  {name:'transitive callback alias',
    tail:'const choose=()=>f;const relay=choose;module.exports=Object.keys(Object.groupBy([1],relay))[0].includes("a^17");'},
  {name:'aliased Object namespace with arrow callback',
    tail:'const Own=Object;module.exports=Object.keys(Own.groupBy([1],()=>f))[0].includes("a^17");'}
];

test('Object.groupBy stringifies function-valued callback return property keys',()=>{
  assert.equal(typeof Reflect.get(Object,'groupBy'),'function','Requires Node 22+ Object.groupBy');
  for(const item of consumers){
    const source='function f(a){return a^17;}'+item.tail;
    assert.equal(load(source),true,'Native observer: '+item.name);
    const result=lowerWasmI32Functions(source,'commonjs',{
      seed:'object-groupby-source-'+item.name,names:['f']
    });
    assert.equal(result.functions,0,'Must refuse selected f: '+item.name);
    assert.equal(result.declined,1,'Must report refusal: '+item.name);
    assert.equal(result.code,source,'Must retain source: '+item.name);
  }
});

test('Object.groupBy constant string key cannot observe a function and remains eligible',()=>{
  const source='function f(a){return a^17;}module.exports=['+
    'f(3),Object.keys(Object.groupBy([1,2],()=> "fixed"))[0]];';
  const generated=lowerWasmI32Functions(source,'commonjs',{
    seed:'groupby-primitive-key-positive',names:['f']
  });
  assert.equal(generated.functions,1);
  assert.equal(generated.declined,0);
  assert.deepEqual(Array.from(/** @type {unknown[]} */(load(generated.code))),
    Array.from(/** @type {unknown[]} */(load(source))));
});

test('cross-file Object.groupBy function-valued callback rejects unsafe explicit Wasm selection',()=>{
  /** @type {import('../src/core').SourceFile[]} */
  const files=[
    {path:'protected.mjs',sourceType:'module',code:'export function f(a){return a^17;}'},
    {path:'consumer.mjs',sourceType:'module',
      code:'import {f} from "./protected.mjs";export const key=Object.keys(Object.groupBy([1],()=>f))[0];'}
  ];
  assert.throws(()=>obfuscateFiles(files,{
    mode:'coo',seed:'groupby-cross-graph',closedWorld:true,strings:false,
    experimentalWasmI32:{'protected.mjs':['f']}
  }),/Wasm i32 requires a module\/CommonJS without cross-file source observation/u);
});
