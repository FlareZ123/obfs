'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/**
 * Two classic scripts share a global lexical realm. A later, declared script
 * can observe exact Function source even when a function has no return-value
 * or object-property escape from its local owner.
 * @param {string[]} scripts
 * @returns {{observable:string,properties:number}}
 */
function execute(scripts){
  const emitted=obfuscateFiles(scripts.map((code,index)=>({
    path:'script'+index+'.js',sourceType:/** @type {const} */('script'),code
  })),{mode:'coo',seed:'classic-stringify-join-proof',closedWorld:true,
    strings:false,identifiers:false});
  const context=vm.createContext({});
  for(const file of emitted.files)
    vm.runInContext(/** @type {string} */(file.code),context,{timeout:2000});
  return {observable:JSON.stringify({value:context.result,spelling:context.spelling}),
    properties:emitted.files.reduce((total,file)=>total+file.metrics.properties,0)};
}

/** @param {string[]} scripts @returns {string} */
function native(scripts){
  const context=vm.createContext({});
  for(const source of scripts)vm.runInContext(source,context,{timeout:2000});
  return JSON.stringify({value:context.result,spelling:context.spelling});
}

const producer='function compute(){const state={secretField:29,bonusField:3};' +
  'return state.secretField+state.bonusField;}globalThis.result=compute();';

const cases=[
  ['direct String', 'globalThis.spelling=String(compute);'],
  ['cross-script Array.join helper',
    'function sourceView(fn){return [fn].join("");}' +
    'globalThis.spelling=sourceView(compute);']
];

for(const [name,observer] of cases){
  test('private classic owner keeps source semantics with '+name,()=>{
    const scripts=[producer,observer];
    const actual=execute(scripts);
    assert.equal(actual.observable,native(scripts));
    assert.equal(actual.properties,0,
      'Transformed Function source would differ from native observable text');
  });
}
