'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {obfuscateFiles}=require('../src');

/** @returns {string} */
function protectedSource(){
  let result='(input|0)';
  for(const step of [17,-8,213,-55,64,-2,34,-10]) {
    result='('+result+(step>=0?'+':'')+step+')';
  }
  return 'export function protectedSum(input){return ('+result+'|0);}\n';
}

/**
 * @param {string} producerTail
 * @param {string} consumerBody
 * @returns {import('../src/core').SourceFile[]}
 */
function graph(producerTail,consumerBody){
  return [
    {path:'producer.mjs',sourceType:'module',
      code:protectedSource()+producerTail},
    {path:'entry.mjs',sourceType:'module',
      code:'import {values} from "./producer.mjs";'+consumerBody}
  ];
}

/** @param {import('../src/core').SourceFile[]} files */
function protect(files) {
  return obfuscateFiles(files,{
    mode:'coo',closedWorld:true,
    seed:'cross-esm-implicit-array-function-source',
    strings:false,identifiers:false,properties:false,
    experimentalPolyvariantAffine:{'producer.mjs':['protectedSum']},
    experimentalPolyvariantCount:2
  });
}

for(const [name,tail,body] of [
  ['direct imported function array',
    'export const values=[protectedSum,"function protectedSum(input){m"];',
    'const order=values.sort().map(x=>typeof x==="function"?"fn":"str").join(",");'+
      'console.log(order);'],
  ['imported nested function array',
    'const inner=[protectedSum];export const values=[inner];',
    'console.log(values.join(","));'],
  ['imported alias of function array',
    'export const values=[protectedSum];',
    'const alias=values;console.log(alias.join(","));'],
  ['imported default-sort through detached method',
    'export const values=[protectedSum,"function protectedSum(input){m"];',
    'const sorter=Array.prototype.sort;const sorted=sorter.call(values);'+
      'console.log(sorted.map(x=>typeof x==="function"?"fn":"str").join(","));']
]) {
  test('cross-file function-source observer refuses selected body rewrite: '+name,()=>{
    assert.throws(()=>protect(graph(tail,body)),/(?:source observation|declined)/i);
  });
}

test('verified imported primitive array still permits a protected function rewrite',()=>{
  const files=graph('export const values=[3,1,2];',
    'values.sort();console.log(values.join(","));');
  const output=protect(files);
  assert.equal(output.files[0].metrics.polyvariantFunctions,1);
  assert.ok(String(output.files[0].code).includes('protectedSum'));
});
