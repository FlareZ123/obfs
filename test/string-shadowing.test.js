'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/**
 * Keep the identifier pass disabled so the string encoder is responsible
 * for handling lexical collisions with its runtime intrinsic.
 * @param {string} source
 * @returns {ReturnType<typeof obfuscateFiles>['files'][number]}
 */
function encode(source) {
  return obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:source}],{
    mode:'sno',seed:'string-shadow',properties:false,identifiers:false
  }).files[0];
}

/** @param {string} source @returns {unknown} */
function evaluate(source) {
  const context={module:{exports:null}};
  vm.runInNewContext(source,context,{timeout:1000});
  return context.module.exports;
}

test('lexical String binding cannot capture decoder intrinsic',()=>{
  const source=`const String=17;module.exports='shadowed-string-literal';`;
  const transformed=encode(source);
  assert.equal(transformed.metrics.literals,0);
  assert.equal(evaluate(transformed.code),evaluate(source));
});

test('Unicode escape spelling of String binding is also detected',()=>{
  const source='const S\\u0074ring=7;module.exports="unicode-string-shadow";';
  const transformed=encode(source);
  assert.equal(transformed.metrics.literals,0);
  assert.equal(evaluate(transformed.code),evaluate(source));
});

test('unshadowed global String remains compatible with encoded literals',()=>{
  const source=`module.exports=String('ordinary-string-literal');`;
  const transformed=encode(source);
  assert.equal(evaluate(transformed.code),evaluate(source));
  assert.ok(transformed.metrics.literals>0);
});
