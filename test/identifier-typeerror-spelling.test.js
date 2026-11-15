'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/** @param {string} source @returns {string|number|null} */
function evaluate(source) {
  const context={module:{exports:null}};
  vm.runInNewContext(source,context,{timeout:1000});
  return context.module.exports;
}

/**
 * Isolate identifier renaming; error.message and error.stack are observable
 * program results in the target VM.
 * @param {string} source
 * @param {string} protectedName
 */
function preserve(source,protectedName) {
  const result=obfuscateFiles([{path:'error.cjs',code:source,sourceType:'commonjs'}],{
    mode:'sno',seed:'identifier-error-spelling',strings:false,properties:false
  }).files[0];
  assert.equal(evaluate(result.code),evaluate(source),result.code);
  assert.match(result.code,new RegExp('\\b'+protectedName+'\\b'),result.code);
}

test('failed direct function call preserves its binding spelling',()=>{
  preserve(
    'const invalidCall=13;let result;try{invalidCall();}catch(error){result=error.message;}module.exports=result;',
    'invalidCall'
  );
});

test('failed member method call retains the receiver binding spelling',()=>{
  preserve(
    'const receiver={act:13};let result;try{receiver.act();}catch(error){result=error.message;}module.exports=result;',
    'receiver'
  );
});

test('failed constructor call preserves its binding spelling',()=>{
  preserve(
    'const badConstructor=13;let result;try{new badConstructor();}catch(error){result=error.message;}module.exports=result;',
    'badConstructor'
  );
});

test('noniterable array spread preserves its source binding spelling',()=>{
  preserve(
    'const badIterable=13;let result;try{[...badIterable];}catch(error){result=error.message;}module.exports=result;',
    'badIterable'
  );
});

test('noniterable for-of preserves its source binding spelling',()=>{
  preserve(
    'const iterableSource=13;let result;try{for(const value of iterableSource){}}catch(error){result=error.message;}module.exports=result;',
    'iterableSource'
  );
});

test('nested member spread preserves receiver binding spelling',()=>{
  preserve(
    'const nested={value:13};let result;try{[...nested.value];}catch(error){result=error.message;}module.exports=result;',
    'nested'
  );
});

test('nullish object destructuring declaration retains source spelling',()=>{
  preserve(
    'const nullishSource=null;let result;try{const {entry}=nullishSource;}catch(error){result=error.message;}module.exports=result;',
    'nullishSource'
  );
});

test('nullish object destructuring assignment retains source spelling',()=>{
  preserve(
    'const assignmentSource=undefined;let entry,result;try{({entry}=assignmentSource);}catch(error){result=error.message;}module.exports=result;',
    'assignmentSource'
  );
});

test('nullish object rest destructuring retains source spelling',()=>{
  preserve(
    'const restSource=null;let result;try{const {...entries}=restSource;}catch(error){result=error.message;}module.exports=result;',
    'restSource'
  );
});

test('proven nonnull const object source remains renameable through destructuring',()=>{
  const source='const fixedSource={entry:7};const {entry}=fixedSource;module.exports=entry;';
  const result=obfuscateFiles([{path:'nonnull.cjs',code:source,sourceType:'commonjs'}],{
    mode:'sno',seed:'identifier-nonnull-pattern',strings:false,properties:false
  }).files[0];
  assert.equal(evaluate(result.code),evaluate(source),result.code);
  assert.doesNotMatch(result.code,/\bfixedSource\b/,result.code);
  assert.ok(result.metrics.bindings>=1);
});

test('object spread needs no iteration and preserves safe identifier renaming',()=>{
  const source='const spreadSource={entry:8};const copy={...spreadSource};module.exports=copy.entry;';
  const result=obfuscateFiles([{path:'object-spread.cjs',code:source,sourceType:'commonjs'}],{
    mode:'sno',seed:'identifier-noniterating-spread',strings:false,properties:false
  }).files[0];
  assert.equal(evaluate(result.code),evaluate(source),result.code);
  assert.doesNotMatch(result.code,/\bspreadSource\b/,result.code);
  assert.ok(result.metrics.bindings>=1);
});

test('mutable object that becomes null still protects original TypeError spelling',()=>{
  preserve(
    'let mutableSource={entry:9};mutableSource=null;let result;try{const {entry}=mutableSource;}catch(error){result=error.message;}module.exports=result;',
    'mutableSource'
  );
});

test('safe arithmetic binding remains eligible for transformation',()=>{
  const source='const arithmeticOnly=27;module.exports=arithmeticOnly*2;';
  const result=obfuscateFiles([{path:'safe.cjs',code:source,sourceType:'commonjs'}],{
    mode:'sno',seed:'identifier-error-positive',strings:false,properties:false
  }).files[0];
  assert.equal(evaluate(result.code),54);
  assert.equal(result.metrics.bindings,1);
  assert.doesNotMatch(result.code,/\barithmeticOnly\b/);
});
