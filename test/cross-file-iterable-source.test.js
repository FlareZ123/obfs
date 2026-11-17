'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {obfuscateFiles}=require('../src');

/** @returns {string} */
function protectedSource() {
  let expression='(input|0)';
  for(const step of [17,-8,213,-55,64,-2,34,-10])
    expression='('+expression+(step>=0?'+':'')+step+')';
  return 'export function protectedSum(input){return ('+expression+'|0);}\n';
}

/** @param {string} tail @param {string} body @returns {import('../src/core').SourceFile[]} */
function graph(tail,body) {
  return [
    {path:'producer.mjs',sourceType:'module',code:protectedSource()+tail},
    {path:'entry.mjs',sourceType:'module',
      code:'import {values} from "./producer.mjs";'+body}
  ];
}

/** @param {import('../src/core').SourceFile[]} files */
function protect(files) {
  return obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'cross-esm-iterable-source',
    strings:false,identifiers:false,properties:false,
    experimentalPolyvariantAffine:{'producer.mjs':['protectedSum']},
    experimentalPolyvariantCount:2
  });
}

for(const [name,tail,body] of [
  ['exported function-bearing Set',
    'export const values=new Set([protectedSum]);',
    'console.log(Array.from(values).join(","));'],
  ['exported function-bearing Map',
    'export const values=new Map([[0,protectedSum]]);',
    'console.log(Array.from(values.values()).join(","));'],
  ['Set mutated after declaration',
    'export const values=new Set();values.add(protectedSum);',
    'console.log([...values].join(","));'],
  ['Map mutated after declaration',
    'export const values=new Map();values.set(0,protectedSum);',
    'console.log([...values.values()].join(","));'],
  ['Set alias mutated after declaration',
    'const owner=new Set();const alias=owner;alias.add(protectedSum);export {owner as values};',
    'console.log(Array.from(values).join(","));']
]) {
  test('ESM '+name+' observes protected function source',()=>{
    assert.throws(()=>protect(graph(tail,body)),/(?:source observation|declined)/i);
  });
}


test('ESM default-exported function Set preserves original function source',()=>{
  const files=[
    {path:'producer.mjs',sourceType:'module',
      code:protectedSource()+'export default new Set([protectedSum]);'},
    {path:'entry.mjs',sourceType:'module',
      code:'import values from "./producer.mjs";console.log([...values].join(","));'}
  ];
  assert.throws(()=>protect(files),/(?:source observation|declined)/i);
});

test('ESM reexported Set carries protected function source across modules',()=>{
  const producer={path:'producer.mjs',sourceType:'module',
    code:protectedSource()+'export const values=new Set([protectedSum]);'};
  const relay={path:'relay.mjs',sourceType:'module',
    code:'export {values as forwarded} from "./producer.mjs";'};
  const entry={path:'entry.mjs',sourceType:'module',
    code:'import {forwarded as values} from "./relay.mjs";'+
      'console.log(Array.from(values).join(","));'};
  assert.throws(()=>protect([producer,relay,entry]),/(?:source observation|declined)/i);
});

test('ESM Map function key stringifies through imported keys iterator',()=>{
  const files=graph('export const values=new Map([[protectedSum,0]]);',
    'console.log(Array.from(values.keys()).join(","));');
  assert.throws(()=>protect(files),/(?:source observation|declined)/i);
});


for(const [name,tail,body] of [
  ['Set inserted through for-of binding',
    'export const values=new Set();for(const fn of [protectedSum])values.add(fn);',
    'console.log(Array.from(values).join(","));'],
  ['Set inserted through forEach callback',
    'export const values=new Set();[protectedSum].forEach(fn=>values.add(fn));',
    'console.log([...values].join(","));'],
  ['Map populated through for-of binding',
    'export const values=new Map();for(const fn of [protectedSum])values.set(1,fn);',
    'console.log(Array.from(values.values()).join(","));']
]) {
  test('ESM '+name+' exposes protected function source',()=>{
    assert.throws(()=>protect(graph(tail,body)),/(?:source observation|declined)/i);
  });
}

test('ESM primitive-only for-of Set inserts preserve protected work',()=>{
  const files=graph(
    'export const values=new Set();for(const n of [1,2,3])values.add(n);',
    'console.log(Array.from(values).join(","));');
  const emitted=protect(files);
  assert.equal(emitted.files[0].metrics.polyvariantFunctions,1);
});


for(const [name,tail,body] of [
  ['Map forEach function key',
    'export const values=new Map([[protectedSum,0]]);',
    'const array=[];values.forEach((value,key)=>array.push(key));'+
      'console.log(array.join(","));'],
  ['Set forEach second argument',
    'export const values=new Set([protectedSum]);',
    'const array=[];values.forEach((value,second)=>array.push(second));'+
      'console.log(array.join(","));']
]) {
  test('ESM '+name+' remains source-sensitive',()=>{
    assert.throws(()=>protect(graph(tail,body)),/(?:source observation|declined)/i);
  });
}

test('ESM primitive-only Map.forEach second argument preserves protected work',()=>{
  const files=graph('export const values=new Map([[3,1]]);',
    'const keys=[];values.forEach((value,key)=>keys.push(key));console.log(keys.join(","));');
  const emitted=protect(files);
  assert.equal(emitted.files[0].metrics.polyvariantFunctions,1);
});


for(const [name,tail,body] of [
  ['Set forEach collection argument',
    'export const values=new Set([protectedSum]);',
    'values.forEach((v,k,owner)=>console.log(Array.from(owner).join(",")));'],
  ['Map forEach collection argument',
    'export const values=new Map([[0,protectedSum]]);',
    'values.forEach((v,k,owner)=>console.log(Array.from(owner.values()).join(",")));']
]) {
  test('ESM '+name+' cannot change protected function text',()=>{
    assert.throws(()=>protect(graph(tail,body)),/(?:source observation|declined)/i);
  });
}


for(const [name,tail] of [
  ['Set union receiver',
    'const source=new Set([protectedSum]);export const values=source.union(new Set());'],
  ['Set union argument',
    'export const values=new Set().union(new Set([protectedSum]));'],
  ['Set intersection',
    'const source=new Set([protectedSum]);export const values=source.intersection(source);'],
  ['Set symmetricDifference',
    'const source=new Set([protectedSum]);export const values=source.symmetricDifference(new Set());']
]) {
  test('ESM exported '+name+' retains original function source',()=>{
    assert.throws(()=>protect(graph(tail,'console.log([...values].join(","));')),
      /(?:source observation|declined)/i);
  });
}

test('ESM primitive Set union retains unrelated protected work',()=>{
  const files=graph(
    'export const values=new Set([1,2]).union(new Set([2,3]));',
    'console.log([...values].join(","));');
  const out=protect(files);
  assert.equal(out.files[0].metrics.polyvariantFunctions,1);
});

test('ESM imported primitive-only Set and Map permit unrelated protected work',()=>{
  const files=graph(
    'export const values=new Set([1,2,3]);',
    'console.log(Array.from(values).join(","));'
  );
  const emitted=protect(files);
  assert.equal(emitted.files[0].metrics.polyvariantFunctions,1);
});
