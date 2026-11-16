'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/** @param {string} code @returns {unknown[]} */
function executeScript(code){
  const context={};
  vm.runInNewContext(code,context,{timeout:2000});
  return Array.from(/** @type {unknown[]} */(context.result));
}

/** @param {string} code @returns {ReturnType<typeof obfuscateFiles>} */
function compile(code){
  return obfuscateFiles([{
    path:'classic.js',sourceType:'script',code
  }],{
    mode:'coo',seed:'dynamic-code-owned-array-v1',
    properties:true,strings:false,identifiers:false
  });
}

const header=[
  'const owner={secretField:19,otherField:7};',
  'const holder=[owner];',
  'const alias=holder[0];'
].join('\n');

test('script-global lexical holder accessed by Function retains original keys',()=>{
  for(const body of [
    'globalThis.result=[alias.secretField,Function("return holder[0].secretField")()];',
    'const get=globalThis.Function;globalThis.result=[alias.secretField,get("return holder[0].secretField")()];',
    'const get=globalThis["Function"];globalThis.result=[alias.secretField,get("return holder[0].secretField")()];',
    'globalThis.result=[alias.secretField,(new Function("return holder[0].secretField"))()];',
    'const get=({}).constructor.constructor;globalThis.result=[alias.secretField,get("return holder[0].secretField")()];'
  ]){
    const source=header+'\n'+body;
    const emitted=compile(source);
    assert.equal(emitted.files[0].metrics.objects,0,
      'Dynamic Function can observe the original classic-script holder: '+body);
    assert.equal(String(emitted.files[0].code),source);
    assert.deepEqual(executeScript(String(emitted.files[0].code)),executeScript(source));
    assert.deepEqual(executeScript(source),[19,19]);
  }
});

test('indirect eval and eval alias may access classic-script global lexical bindings',()=>{
  for(const body of [
    'globalThis.result=[alias.secretField,(0,eval)("holder[0].secretField")];',
    'const get=eval;globalThis.result=[alias.secretField,get("holder[0].secretField")];',
    'globalThis.result=[alias.secretField,eval?.("holder[0].secretField")];'
  ]){
    const source=header+'\n'+body;
    const emitted=compile(source);
    assert.equal(emitted.files[0].metrics.objects,0,
      'Indirect eval may observe original property labels: '+body);
    assert.equal(String(emitted.files[0].code),source);
    assert.deepEqual(executeScript(source),[19,19]);
  }
});

test('plain data mentioning Function retains safe transformation coverage',()=>{
  const source=header+'\n'+
    'const ordinary="Function";globalThis.result=[alias.secretField,owner.otherField,ordinary.length];';
  const emitted=compile(source);
  assert.ok(emitted.files[0].metrics.properties>=2);
  assert.deepEqual(executeScript(String(emitted.files[0].code)),executeScript(source));
});
