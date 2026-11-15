'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

/** @param {string} code @returns {unknown} */
function evaluate(code) {
  const context={module:{exports:null}};
  vm.runInNewContext(code,context,{timeout:3000});
  return context.module.exports;
}

for(const [name,code] of [
  ['computed function member name aliased through a const',
    'function show(){const local={secretField:42};return local.secretField;}'+
    'const key="toString";module.exports=show[key]();'],
  ['Reflect.get source method name aliased through a const',
    'function show(){const local={secretField:42};return local.secretField;}'+
    'const key="toString";const getter=Reflect.get(Object.getPrototypeOf(()=>{}),key);'+
    'module.exports=getter.call(show);']
]) {
  test('SNO preserves source under '+name,()=>{
    const ast=parse(code,'commonjs');
    assert.equal(observesFunctionSource(ast),true,'Source observer must be recognized before rewriting');
    const output=obfuscateFiles([{path:'case.cjs',sourceType:'commonjs',code}],{
      mode:'sno',seed:'computed-source-observer/'+name,strings:false
    });
    assert.equal(evaluate(output.files[0].code),evaluate(code));
  });
}

test('without source inspection an ordinary private own property remains eligible',()=>{
  const code='function show(){const local={secretField:42};return local.secretField;}module.exports=show();';
  assert.equal(observesFunctionSource(parse(code,'commonjs')),false);
  const output=obfuscateFiles([{path:'case.cjs',sourceType:'commonjs',code}],{
    mode:'sno',seed:'computed-source-positive',strings:false
  });
  assert.ok(output.files[0].metrics.properties>0);
  assert.equal(evaluate(output.files[0].code),42);
});
