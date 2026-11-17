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

for(const [name,relay] of [
  ['named reexport','export {values} from "./producer.mjs";'],
  ['renamed reexport','export {values as forwarded} from "./producer.mjs";'],
  ['star reexport','export * from "./producer.mjs";']
]) {
  test('transitive ESM '+name+' retains observable function source',()=>{
    const producer={path:'producer.mjs',sourceType:'module',
      code:protectedSource()+'export const values=[protectedSum];'};
    const bridge={path:'relay.mjs',sourceType:'module',code:relay};
    const binding=name==='renamed reexport'?'forwarded as values':'values';
    const entry={path:'entry.mjs',sourceType:'module',
      code:'import {'+binding+'} from "./relay.mjs";console.log(values.join(","));'};
    assert.throws(()=>protect([producer,bridge,entry]),/(?:source observation|declined)/i);
  });
}

test('double-hop ESM reexport of function-array cannot bypass source closure',()=>{
  const producer={path:'producer.mjs',sourceType:'module',
    code:protectedSource()+'export const values=[protectedSum];'};
  const relay={path:'relay.mjs',sourceType:'module',
    code:'export {values} from "./producer.mjs";'};
  const relay2={path:'relay2.mjs',sourceType:'module',
    code:'export * from "./relay.mjs";'};
  const entry={path:'entry.mjs',sourceType:'module',
    code:'import {values} from "./relay2.mjs";console.log(values.join(","));'};
  assert.throws(()=>protect([producer,relay,relay2,entry]),/(?:source observation|declined)/i);
});

for(const [name,producerBody,importClause] of [
  ['inline default array','export default [protectedSum];',
    'import values from "./producer.mjs";'],
  ['default alias','const values=[protectedSum];export default values;',
    'import values from "./producer.mjs";']
]) {
  test('ESM '+name+' import of function array retains source bytes',()=>{
    const files=[
      {path:'producer.mjs',sourceType:'module',code:protectedSource()+producerBody},
      {path:'entry.mjs',sourceType:'module',
        code:importClause+'console.log(values.join(","));'}
    ];
    assert.throws(()=>protect(files),/(?:source observation|declined)/i);
  });
}

test('primitive-only arrays forwarded through ESM reexports retain protected work',()=>{
  const files=[
    {path:'producer.mjs',sourceType:'module',
      code:protectedSource()+'export const values=[3,1,2];'},
    {path:'relay.mjs',sourceType:'module',
      code:'export {values} from "./producer.mjs";'},
    {path:'entry.mjs',sourceType:'module',
      code:'import {values} from "./relay.mjs";values.sort();console.log(values.join(","));'}
  ];
  const emitted=protect(files);
  assert.equal(emitted.files[0].metrics.polyvariantFunctions,1);
});

for(const [name,producerTail] of [
  ['push after empty export',
    'export const values=[];values.push(protectedSum);'],
  ['splice after empty export',
    'export const values=[];values.splice(0,0,protectedSum);'],
  ['alias pushes to exported owner',
    'const owner=[];const alias=owner;alias.unshift(protectedSum);export {owner as values};'],
  ['function spread pushed into exported owner',
    'const elements=[protectedSum];export const values=[];values.push(...elements);'],
  ['indexed assignment to exported array',
    'export const values=[];values[0]=protectedSum;'],
  ['multi-module relay of mutated function array',
    'export const values=[];values.push(protectedSum);']
]) {
  test('cross-file '+name+' preserves source when imported Array is joined',()=>{
    const producer={path:'producer.mjs',sourceType:'module',
      code:protectedSource()+producerTail};
    const consumer={path:'entry.mjs',sourceType:'module',
      code:'import {values} from "./producer.mjs";console.log(values.join(","));'};
    if(name.includes('relay')) {
      const relay={path:'relay.mjs',sourceType:'module',
        code:'export {values} from "./producer.mjs";'};
      consumer.code='import {values} from "./relay.mjs";console.log(values.join(","));';
      assert.throws(()=>protect([producer,relay,consumer]),/(?:source observation|declined)/i);
    } else {
      assert.throws(()=>protect([producer,consumer]),/(?:source observation|declined)/i);
    }
  });
}

test('primitive-only array mutation in exported ESM producer retains protected work',()=>{
  const files=graph('export const values=[];values.push(3);values.unshift(2);',
    'console.log(values.join(","));');
  const emitted=protect(files);
  assert.equal(emitted.files[0].metrics.polyvariantFunctions,1);
});

for(const [name,expression] of [
  ['slice of source array','source.slice()'],
  ['concat of source array','source.concat([])'],
  ['Array.from source array','Array.from(source)'],
  ['filter source array','source.filter(()=>true)'],
  ['map source array','source.map(value=>value)'],
  ['toReversed source array','source.toReversed()']
]) {
  test('derived exported '+name+' preserves original function source in importer',()=>{
    const tail='const source=[protectedSum];export const values='+expression+';';
    const files=graph(tail,'console.log(values.join(","));');
    assert.throws(()=>protect(files),/(?:source observation|declined)/i);
  });
}

test('derived primitive-only ESM arrays retain selected unrelated function',()=>{
  const files=graph('const source=[1,2,3];export const values=Array.from(source);',
    'console.log(values.join(","));');
  const emitted=protect(files);
  assert.equal(emitted.files[0].metrics.polyvariantFunctions,1);
});
