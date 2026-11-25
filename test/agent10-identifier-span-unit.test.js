'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {parse}=require('../src/ast');
const {renameLocalIdentifiers}=require('../src/identifiers');

/**
 * @param {string} source
 * @param {string} seed
 * @returns {{code:string,bindings:number}}
 */
function rename(source,seed) {
  return renameLocalIdentifiers(source,parse(source,'module'),{seed,sourceType:'module'});
}

test('identifier edits preserve UTF-16 width for short and long ordinary bindings',()=>{
  for(const [name,source] of [
    ['one','const a=20;const value=a;captureHostStack();export {value};'],
    ['short','const operand=20;const value=operand;captureHostStack();export {value};'],
    ['long','const longOperandName=20;const value=longOperandName;captureHostStack();export {value};']
  ]) {
    const result=rename(source,'agent10-identifier-span-'+name);
    assert.equal(result.bindings,1,name+' binding should remain renameable');
    assert.equal(result.code.length,source.length,name+' output must preserve UTF-16 source length');
    assert.doesNotThrow(()=>parse(result.code,'module'));
    assert.notEqual(result.code,source,name+' binding should be obfuscated');
  }
});

test('identifier edit refuses shorthand expansion instead of shifting source positions',()=>{
  const source='const marker=7;const result={marker};captureHostStack();export {result};';
  const result=rename(source,'agent10-identifier-span-shorthand');
  assert.equal(result.bindings,0);
  assert.equal(result.code,source);
});

test('identifier edit refuses tagged-template references before inserting padding',()=>{
  const source='const tag=String;const value=tag`x`;captureHostStack();export {value};';
  const result=rename(source,'agent10-identifier-span-tag');
  assert.equal(result.bindings,0);
  assert.equal(result.code,source);
});
