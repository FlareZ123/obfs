'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/** @param {string[]} code @returns {string} */
function run(code){
  const context=vm.createContext({});
  for(const script of code)vm.runInContext(script,context,{timeout:2000});
  return JSON.stringify({value:context.result,spelling:context.spelling});
}

/** @param {string[]} scripts @returns {{code:string[],properties:number}} */
function protectedScripts(scripts){
  const result=obfuscateFiles(scripts.map((code,index)=>({
    path:'classic'+index+'.js',
    sourceType:/** @type {const} */('script'),
    code
  })),{
    mode:'coo',closedWorld:true,seed:'classic-cross-source-falsifier',
    strings:false,identifiers:false
  });
  return {code:result.files.map(file=>/** @type {string} */(file.code)),
    properties:result.files.reduce((sum,file)=>sum+file.metrics.properties,0)};
}

const producer='function compute(){const state={secretField:29,bonusField:3};' +
  'return state.secretField+state.bonusField;}globalThis.result=compute();';

test('positive nonobserving other classic script still permits private rename',()=>{
  const scripts=[producer,'globalThis.spelling="constant";'];
  const emitted=protectedScripts(scripts);
  assert.equal(emitted.properties,2);
  assert.equal(run(emitted.code),run(scripts));
});

const observers=[
  ['direct String function', 'globalThis.spelling=String(compute);'],
  ['wrapper String function',
    'function sourceView(fn){return String(fn);}' +
    'globalThis.spelling=sourceView(compute);'],
  ['wrapper template literal',
    'function sourceView(fn){return `${fn}`;}' +
    'globalThis.spelling=sourceView(compute);'],
  ['wrapper Function#toString',
    'function sourceView(fn){return fn.toString();}' +
    'globalThis.spelling=sourceView(compute);'],
  ['wrapper array join',
    'function sourceView(fn){return [fn].join("");}' +
    'globalThis.spelling=sourceView(compute);']
];

for(const [name,consumer] of observers){
  test('independent classic script preserves callable source via '+name,()=>{
    const scripts=[producer,consumer];
    const emitted=protectedScripts(scripts);
    assert.equal(run(emitted.code),run(scripts),
      'A later classic script receives compute function as an argument');
    assert.equal(emitted.properties,0,
      'No renaming with a declared function-source observer');
  });
}
