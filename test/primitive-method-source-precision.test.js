'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

/** @param {string} code @returns {string} */
function evaluate(code) {
  const sandbox={module:{exports:null}};
  vm.runInNewContext(code,sandbox,{timeout:2000});
  return JSON.stringify(sandbox.module.exports);
}

/** @param {string} setup @param {string} receiver @returns {string} */
function fixture(setup,receiver) {
  return "'use strict';"+setup+"const internal={secretField:19};"+
    'const observed='+receiver+';module.exports={observed,value:internal.secretField};';
}

for(const [name,setup,receiver] of [
  ['number literal','', '(19).toString(16)'],
  ['const number',"const n=255;", 'n.toString(16)'],
  ['aliased numeric primitive',"const x=255;const n=x;", 'n.toString(16)'],
  ['computed toString name',"const k='toString';const n=255;", 'n[k](16)'],
  ['const string primitive',"const n='abc';", 'n.toString()'],
  ['const bigint primitive',"const n=255n;", 'n.toString(16)'],
  ['constant arithmetic',"const n=250+5;", 'n.toString(16)'],
  ['literal boolean','', '(true).toString()'],
  ['literal null-ish optional','', '(null)?.toString()']
]) {
  test('proven primitive toString receiver preserves own-field coverage: '+name,()=>{
    const original=fixture(setup,receiver);
    const obfuscated=obfuscateFiles([{path:'test.cjs',sourceType:'commonjs',code:original}],{
      mode:'sno',seed:'primitive-method/'+name,strings:false
    }).files[0];
    assert.equal(evaluate(obfuscated.code),evaluate(original),obfuscated.code);
    assert.equal(obfuscated.metrics.properties,1,obfuscated.code);
  });
}

for(const [name,setup,receiver] of [
  ['Function native source','function inspect(){return 123;}', 'inspect.toString()'],
  ['function expression alias','const inspect=()=>123;', 'inspect.toString()'],
  ['opaque receiver','const target=globalThis;', 'target.toString()'],
  ['plain object receiver',"const target={toString(){return '42';}};", 'target.toString()']
]) {
  test('unproved toString receiver retains source-observation refusal: '+name,()=>{
    const original=fixture(setup,receiver);
    const obfuscated=obfuscateFiles([{path:'test.cjs',sourceType:'commonjs',code:original}],{
      mode:'sno',seed:'unknown-method/'+name,strings:false
    }).files[0];
    assert.equal(evaluate(obfuscated.code),evaluate(original),obfuscated.code);
    assert.equal(obfuscated.metrics.properties,0,obfuscated.code);
  });
}

test('primitive receiver AST witness and opaque function boundary',()=>{
  assert.equal(observesFunctionSource(parse("const n=255;n.toString(16);",'commonjs')),false);
  assert.equal(observesFunctionSource(parse("const k='toString';const n=255;n[k](16);",'commonjs')),false);
  assert.equal(observesFunctionSource(parse("function inspect(){};inspect.toString();",'commonjs')),true);
});
