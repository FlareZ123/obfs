'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

/** @param {string} code @returns {string} */
function execute(code) {
  const context={module:{exports:null},TextEncoder,TextDecoder,FormData,Blob};
  vm.runInNewContext(code,context,{timeout:2000});
  return JSON.stringify(context.module.exports);
}

/** @param {string} expression @returns {string} */
function fixture(expression) {
  return "'use strict';function inspect(){const state={secretField:41};return state.secretField;}"+
    "const observed="+expression+";module.exports={observed,value:inspect()};";
}

for(const [name,expression] of [
  ['TextEncoder encode',"new TextDecoder().decode(new TextEncoder().encode(inspect))"],
  ['TextEncoder alias',"(()=>{const encoder=new TextEncoder();return new TextDecoder().decode(encoder.encode(inspect));})()"],
  ['TextEncoder global',"new TextDecoder().decode(new globalThis.TextEncoder().encode(inspect))"],
  ['FormData append value',"(()=>{const form=new FormData();form.append('field',inspect);return form.get('field');})()"],
  ['FormData append name',"(()=>{const form=new FormData();form.append(inspect,'field');return [...form.keys()][0];})()"],
  ['FormData set value',"(()=>{const form=new FormData();form.set('field',inspect);return form.get('field');})()"],
  ['FormData alias',"(()=>{const form=new FormData();const copy=form;copy.set('field',inspect);return form.get('field');})()"],
  ['FormData global',"(()=>{const form=new globalThis.FormData();form.append('field',inspect);return form.get('field');})()"],
  ['Blob function part',"new Blob([inspect]).size"],
  ['Blob function part alias',"(()=>{const parts=[inspect];return new Blob(parts).size;})()"],
  ['Blob global constructor',"new globalThis.Blob([inspect]).size"]
]) {
  test('web platform operation implicitly sees native function source: '+name,()=>{
    const original=fixture(expression);
    const result=obfuscateFiles([{path:'case.cjs',sourceType:'commonjs',code:original}],{
      mode:'sno',seed:'source-web-operations/'+name,strings:true
    }).files[0];
    assert.equal(execute(result.code),execute(original),result.code);
    assert.equal(result.metrics.objects,0);
    assert.equal(result.metrics.bindings,0);
    assert.equal(result.metrics.literals,0);
  });
}

test('known primitive inputs to web methods leave unrelated own-key renameable',()=>{
  const original="'use strict';const state={secretField:41};"+
    "const data=new TextEncoder().encode('ordinary');module.exports=data.length+state.secretField;";
  const result=obfuscateFiles([{path:'case.cjs',sourceType:'commonjs',code:original}],{
    mode:'sno',seed:'source-web-operations-primitive',strings:false
  }).files[0];
  assert.equal(execute(result.code),execute(original));
  assert.equal(result.metrics.objects,1);
});

test('AST recognizes proven web platform receiver aliases',()=>{
  assert.equal(observesFunctionSource(parse("const encoder=new TextEncoder();encoder.encode(fn);",'commonjs')),true);
  assert.equal(observesFunctionSource(parse("const form=new FormData();form.append('x',fn);",'commonjs')),true);
  assert.equal(observesFunctionSource(parse("new Blob([fn]);",'commonjs')),true);
  assert.equal(observesFunctionSource(parse("const encoder=new TextEncoder();encoder.encode('text');",'commonjs')),false);
});
