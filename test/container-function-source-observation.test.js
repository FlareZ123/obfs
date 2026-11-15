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

/** @param {string} declarations @param {string} key @returns {string} */
function fixture(declarations,key) {
  return "'use strict';"+declarations+
    "const observed=Object.keys({["+key+"]:1})[0];"+
    "module.exports=observed;";
}

for(const [name,decl,key] of [
  ['object function property',"const lib={inspect:function inspect(){const state={secretField:21};return state.secretField;}};","lib.inspect"],
  ['arrow property',"const lib={inspect:()=>{const state={secretField:22};return state.secretField;}};","lib.inspect"],
  ['object method',"const lib={inspect(){const state={secretField:23};return state.secretField;}};","lib.inspect"],
  ['object alias',"const lib={inspect:function inspect(){const state={secretField:24};return state.secretField;}};const other=lib;","other.inspect"],
  ['member alias',"const lib={inspect:function inspect(){const state={secretField:25};return state.secretField;}};const key=lib.inspect;","key"],
  ['destructured function alias',"const lib={inspect:function inspect(){const state={secretField:26};return state.secretField;}};const {inspect:key}=lib;","key"],
  ['array index',"const lib=[function inspect(){const state={secretField:27};return state.secretField;}];","lib[0]"],
  ['array alias',"const lib=[function inspect(){const state={secretField:28};return state.secretField;}];const other=lib;","other[0]"],
  ['later object property write',"const lib={};lib.inspect=function inspect(){const state={secretField:29};return state.secretField;};","lib.inspect"]
]) {
  test('function held in a local container can expose source via key: '+name,()=>{
    const original=fixture(decl,key);
    const result=obfuscateFiles([{path:'case.cjs',sourceType:'commonjs',code:original}],{
      mode:'sno',seed:'source-container/'+name,strings:true
    }).files[0];
    assert.equal(execute(result.code),execute(original),result.code);
    assert.equal(result.metrics.objects,0);
    assert.equal(result.metrics.bindings,0);
    assert.equal(result.metrics.literals,0);
  });
}

test('numeric object member used as key permits unrelated own-field rewrite',()=>{
  const original="'use strict';const lib={value:7};const state={secretField:31};"+
    "module.exports={key:Object.keys({[lib.value]:1})[0],value:state.secretField};";
  const result=obfuscateFiles([{path:'case.cjs',sourceType:'commonjs',code:original}],{
    mode:'sno',seed:'source-container-numeric',strings:false
  }).files[0];
  assert.equal(execute(result.code),execute(original));
  assert.ok(result.metrics.objects>=1);
});

test('AST recognizer follows local object function property and array element aliases',()=>{
  assert.equal(observesFunctionSource(parse('const lib={f:()=>1};const copy=lib;const obj={[copy.f]:2};','commonjs')),true);
  assert.equal(observesFunctionSource(parse('const lib=[()=>1];const obj={[lib[0]]:2};','commonjs')),true);
  assert.equal(observesFunctionSource(parse('const lib={f:1};const obj={[lib.f]:2};','commonjs')),false);
});
