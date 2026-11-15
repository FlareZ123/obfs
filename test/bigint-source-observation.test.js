'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

/** @param {string} code @returns {string} */
function execute(code) {
  const context={module:{exports:null}};
  vm.runInNewContext(code,context,{timeout:2000});
  return JSON.stringify(context.module.exports);
}

/** @param {string} body @returns {string} */
function fixture(body) {
  return "'use strict';function inspect(){const state={secretField:27};return state.secretField;}"+
    'const observed=(()=>{try{return String('+body+');}catch(error){return error.message;}})();'+
    'module.exports={observed,value:inspect()};';
}

for(const [name,body] of [
  ['BigInt call','BigInt(inspect)'],
  ['BigInt local alias','(()=>{const B=BigInt;return B(inspect);})()'],
  ['BigInt global alias','(()=>{const Root=globalThis;const B=Root.BigInt;return B(inspect);})()'],
  ['BigInt global property','globalThis.BigInt(inspect)'],
  ['BigInt asIntN','BigInt.asIntN(8,inspect)'],
  ['BigInt asUintN','BigInt.asUintN(8,inspect)'],
  ['BigInt asIntN alias','(()=>{const B=BigInt;return B.asIntN(8,inspect);})()']
]) {
  test('BigInt error message exposes exact function source: '+name,()=>{
    const original=fixture(body);
    const result=obfuscateFiles([{path:'case.cjs',sourceType:'commonjs',code:original}],{
      mode:'sno',seed:'source-bigint/'+name,strings:true
    }).files[0];
    assert.equal(execute(result.code),execute(original),result.code);
    assert.equal(result.metrics.objects,0);
    assert.equal(result.metrics.bindings,0);
    assert.equal(result.metrics.literals,0);
  });
}

test('BigInt primitive calls preserve unrelated property renaming',()=>{
  const original="'use strict';const state={secretField:27};module.exports=Number(BigInt('123'))+state.secretField;";
  const result=obfuscateFiles([{path:'case.cjs',sourceType:'commonjs',code:original}],{
    mode:'sno',seed:'source-bigint-primitive',strings:false
  }).files[0];
  assert.equal(execute(result.code),execute(original));
  assert.equal(result.metrics.objects,1);
});

test('AST guard recognizes BigInt conversion and asIntN but not primitive-only calls',()=>{
  assert.equal(observesFunctionSource(parse('BigInt(fn);BigInt.asIntN(8,fn);','commonjs')),true);
  assert.equal(observesFunctionSource(parse("BigInt('17');BigInt.asIntN(8,17n);",'commonjs')),false);
});
