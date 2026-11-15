'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/**
 * @param {string} code
 * @returns {unknown}
 */
function run(code) {
  const sandbox={module:{exports:null}};
  vm.runInNewContext(code,sandbox,{timeout:1000});
  return sandbox.module.exports;
}

/** @param {string} suffix @returns {string} */
function fixture(suffix) {
  return 'function observed(){const data={secretField:17};return data.secretField;}'+
    suffix+';module.exports=JSON.stringify({value:observed(),source:sourceText});';
}

for(const [name,statement] of [
  ['direct array join','const sourceText=[observed].join("")'],
  ['array variable join','const items=[observed];const sourceText=items.join("")'],
  ['transitive array alias','const items=[observed];const copy=items;const sourceText=copy.join("")'],
  ['function alias in array','const fn=observed;const items=[fn];const sourceText=items.join("")'],
  ['inline arrow source','const items=[()=>42];const sourceText=items.join("")'],
  ['function toLocaleString','const sourceText=observed.toLocaleString()'],
  ['aliased function toLocaleString','const fn=observed;const sourceText=fn.toLocaleString()']
]) {
  test('source-changing transforms decline function coercion: '+name,()=>{
    const source=fixture(statement);
    const output=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:source}],{
      mode:'sno',seed:'source-coercion-array/'+name,strings:false
    }).files[0];
    assert.equal(run(output.code),run(source),output.code);
    assert.equal(output.metrics.properties,0,output.code);
    assert.equal(output.metrics.bindings,0,output.code);
  });
}

test('join on plain-number array leaves private property obfuscation enabled',()=>{
  const code='const owner={secretField:17};const parts=[1,2,3];'+
    'module.exports=owner.secretField+parts.join(",");';
  const output=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code}],{
    mode:'sno',seed:'source-coercion-array/positive',strings:false,identifiers:false
  }).files[0];
  assert.equal(run(output.code),run(code));
  assert.equal(output.metrics.properties,1,output.code);
});
