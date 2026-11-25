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
  return renameLocalIdentifiers(source,parse(source,'module'),{seed,sourceType:'module',preserveFramePositions:true});
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


test('escaped identifier spellings with unequal source-token widths retain exact offsets',()=>{
  const fixtures=[
    "const \\u0061lpha=7;const value=alpha;captureHostStack();export {value};",
    "const alpha=7;const value=\\u0061lpha;captureHostStack();export {value};"
  ];
  for(let index=0;index<fixtures.length;index++) {
    const source=fixtures[index];
    const result=rename(source,'agent10-identifier-escaped-'+index);
    assert.equal(result.bindings,1);
    assert.equal(result.code.length,source.length);
    assert.equal(result.code.indexOf('captureHostStack'),source.indexOf('captureHostStack'));
    assert.doesNotThrow(()=>parse(result.code,'module'));
  }
});

test('CRLF and astral identifier tokens preserve UTF-16 source positions',()=>{
  const crlf='const longOperandName=20;\r\nconst value=longOperandName;\r\ncaptureHostStack();\r\nexport {value};\r\n';
  const crlfResult=rename(crlf,'agent10-identifier-crlf');
  assert.equal(crlfResult.bindings,1);
  assert.equal(crlfResult.code.length,crlf.length);
  assert.equal(crlfResult.code.split('\r\n').length,crlf.split('\r\n').length);
  assert.equal(crlfResult.code.indexOf('captureHostStack'),crlf.indexOf('captureHostStack'));
  assert.doesNotThrow(()=>parse(crlfResult.code,'module'));

  const astral='const 𐐀name=7;const value=𐐀name;captureHostStack();export {value};';
  const astralResult=rename(astral,'agent10-identifier-astral');
  assert.equal(astralResult.bindings,1);
  assert.equal(astralResult.code.length,astral.length);
  assert.equal(astralResult.code.indexOf('captureHostStack'),astral.indexOf('captureHostStack'));
  assert.doesNotThrow(()=>parse(astralResult.code,'module'));
});
