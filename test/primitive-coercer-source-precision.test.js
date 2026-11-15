'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

/** @param {string} source @returns {string} */
function execute(source) {
  const context={module:{exports:null}};
  vm.runInNewContext(source,context,{timeout:2000});
  return JSON.stringify(context.module.exports);
}

/** @param {string} setup @param {string} expression @returns {string} */
function fixture(setup,expression) {
  return "'use strict';"+setup+"const state={secretField:37};"+
    "const observed="+expression+";module.exports={observed,value:state.secretField};";
}

for(const [name,setup,expression] of [
  ['direct String alias',"const first='ready';const text=first;",'String(text)'],
  ['global String alias',"const root=globalThis;const Text=root.String;const text='ready';",'Text(text)'],
  ['static conditional',"const flag=true;const text=flag?'yes':'no';",'String(text)'],
  ['new TypeError',"const text='ready';",'new TypeError(text).message'],
  ['RangeError direct',"const text='ready';",'RangeError(text).message'],
  ['RegExp source',"const text='ready';",'RegExp(text).source'],
  ['new RegExp source',"const text='ready';",'new RegExp(text).source'],
  ['Symbol description',"const text='ready';",'Symbol(text).description'],
  ['BigInt comparison',"const value=20;",'BigInt(value)===20n'],
  ['URI conversion',"const text='a b';",'encodeURIComponent(text)'],
  ['transitive arithmetic',"const first=20;const next=first+2;",'String(next)']
]) {
  test('proven primitive coercion permits independent private key rename: '+name,()=>{
    const original=fixture(setup,expression);
    const output=obfuscateFiles([{path:'case.cjs',sourceType:'commonjs',code:original}],{
      mode:'sno',seed:'primitive-coercion/'+name,strings:false
    }).files[0];
    assert.equal(execute(output.code),execute(original),output.code);
    assert.equal(output.metrics.objects,1,output.code);
    assert.equal(output.metrics.properties,1,output.code);
    assert.ok(!output.code.includes('secretField'),output.code);
  });
}

for(const [name,setup,expression] of [
  ['mutable alias',"let text='ready';",'String(text)'],
  ['unknown input',"const text=globalThis.externalText;",'String(text)'],
  ['function source',"function inspect(){const owner={a:1};return owner.a;}",'String(inspect)'],
  ['aliased function source',"function inspect(){return 37;}const text=inspect;",'new Error(text).message']
]) {
  test('unproved coercion still forbids unrelated source rewrites: '+name,()=>{
    const original=fixture(setup,expression);
    const output=obfuscateFiles([{path:'case.cjs',sourceType:'commonjs',code:original}],{
      mode:'sno',seed:'primitive-coercion-negative/'+name,strings:false
    }).files[0];
    assert.equal(execute(output.code),execute(original),output.code);
    assert.equal(output.metrics.objects,0,output.code);
    assert.equal(output.metrics.bindings,0,output.code);
  });
}

test('primitive alias precision preserves the function-source observer boundary',()=>{
  assert.equal(observesFunctionSource(parse("const text='ready';String(text);",'commonjs')),false);
  assert.equal(observesFunctionSource(parse("let text='ready';String(text);",'commonjs')),true);
  assert.equal(observesFunctionSource(parse('function f(){};String(f);','commonjs')),true);
});
