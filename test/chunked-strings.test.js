'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {obfuscateFiles} = require('../src');

/** @param {string} code @returns {string} */
function evaluate(code) {
  const context={module:{exports:null}};
  vm.runInNewContext(code,context,{timeout:5000});
  return JSON.stringify(context.module.exports);
}

/**
 * Transform with runtime decoding active in the SNO environment.
 * @param {string} source
 * @returns {import('../src/core').OutputFile}
 */
function encode(source) {
  return obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:source}],{
    mode:'sno',seed:'chunked-utf16-regression',properties:false,identifiers:false
  }).files[0];
}

test('chunked string decoding preserves large exact UTF-16 values',()=>{
  const literal='α😀\uD800tail\uDC00\u0000\u2028\u2029'.repeat(1400);
  const source='const value='+JSON.stringify(literal)+';module.exports=[value,value.length];';
  const output=encode(source);
  assert.equal(output.metrics.literals,1);
  assert.match(output.code,/String\.fromCharCode\(\.\.\./);
  assert.equal(evaluate(/** @type {string} */ (output.code)),evaluate(source));
});

test('mixed short and long decoded strings preserve each literal',()=>{
  const long='long-data-with-nul\u0000'.repeat(500);
  const source='const short="short-string";const long='+JSON.stringify(long)+';module.exports=[short,long,short.length,long.length];';
  const output=encode(source);
  assert.ok(output.metrics.literals>=2);
  assert.match(output.code,/String\.fromCharCode\(\.\.\./);
  assert.equal(evaluate(/** @type {string} */ (output.code)),evaluate(source));
});

test('short-only literals keep the original simpler decoder',()=>{
  const source='module.exports=["short-word","another-word"];';
  const output=encode(source);
  assert.equal(output.metrics.literals,2);
  assert.doesNotMatch(output.code,/String\.fromCharCode\(\.\.\./);
  assert.equal(evaluate(/** @type {string} */ (output.code)),evaluate(source));
});
