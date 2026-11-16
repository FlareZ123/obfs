'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

/** @param {string} code @returns {string} */
function execute(code) {
  const context={module:{exports:null},require};
  vm.runInNewContext(code,context,{timeout:2000});
  return JSON.stringify(context.module.exports);
}

/** @param {string} expression @returns {string} */
function fixture(expression) {
  return "'use strict';const hidden={secretField:17};"+
    "function inspect(){const embedded='opaque-literal';return hidden.secretField+embedded.length;}"+
    expression+";module.exports={value:inspect(),observed};";
}

for(const [name,expression] of [
  ['direct module','require("node:v8").serialize(inspect)'],
  ['module alias','(()=>{const v8=require("node:v8");return v8.serialize(inspect);})()'],
  ['method alias','(()=>{const v8=require("node:v8");const encode=v8.serialize;return encode(inspect);})()'],
  ['destructured require','(()=>{const {serialize:encode}=require("node:v8");return encode(inspect);})()'],
  ['unprefixed builtin','require("v8").serialize(inspect)'],
  ['indirect call','require("node:v8").serialize.call(null,inspect)'],
  ['indirect apply','require("node:v8").serialize.apply(null,[inspect])']
]) {
  test('v8.serialize function source error: '+name,()=>{
    const source=fixture('let observed;try{'+expression+'}catch(error){observed=error.message}');
    const expected=execute(source);
    assert.match(expected,/function inspect\(\)/);
    const result=obfuscateFiles([{
      path:'case.cjs',sourceType:'commonjs',code:source
    }],{mode:'sno',seed:'v8-serialize/'+name,strings:true}).files[0];
    assert.equal(execute(result.code),expected,'Serialized-error source must match');
    assert.equal(result.metrics.properties,0);
    assert.equal(result.metrics.bindings,0);
    assert.equal(result.metrics.literals,0);
  });
}

test('v8 serialization observer must preserve a function in another module',()=>{
  const files=[
    {path:'function.cjs',sourceType:'commonjs',
      code:"function inspect(){const hidden={secretField:19};return hidden.secretField;}module.exports=inspect;"},
    {path:'observer.cjs',sourceType:'commonjs',
      code:"let text;try{require('node:v8').serialize(require('./function.cjs'))}catch(error){text=error.message}module.exports=text;"}
  ];
  const transformed=obfuscateFiles(files,{mode:'sno',seed:'v8-serialize-cross',strings:true});
  assert.equal(transformed.files[0].code,files[0].code);
  assert.equal(transformed.files[1].code,files[1].code);
});

test('v8.serialize with a primitive preserves own-field transformation',()=>{
  const source=fixture("const observed=require('node:v8').serialize('plain').length");
  const result=obfuscateFiles([{
    path:'case.cjs',sourceType:'commonjs',code:source
  }],{mode:'sno',seed:'v8-serialize-positive',strings:false}).files[0];
  assert.equal(execute(result.code),execute(source));
  assert.equal(result.metrics.properties,1);
});

test('v8 serialization syntactic guard distinguishes primitive inputs',()=>{
  assert.equal(observesFunctionSource(parse("require('node:v8').serialize(fn)",'commonjs')),true);
  assert.equal(observesFunctionSource(parse("require('node:v8').serialize('plain')",'commonjs')),false);
});
