'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

const root=join(__dirname,'..','examples','primitive-coercer');
const before=readFileSync(join(root,'before.cjs'),'utf8');
const after=readFileSync(join(root,'after.cjs'),'utf8');

/** @param {string} source @returns {(arg:unknown)=>unknown} */
function load(source) {
  const module={exports:{}};
  vm.runInNewContext(source,{module},{timeout:2000});
  return /** @type {{calculate:(arg:unknown)=>unknown}} */ (module.exports).calculate;
}

/** @param {()=>unknown} run @returns {unknown} */
function outcome(run) {
  try{return {ok:true,value:run()};}
  catch(error){return {ok:false,name:/** @type {Error} */(error).name,
    message:/** @type {Error} */(error).message};}
}

test('before and after are exactly the current production compiler output',()=>{
  const result=obfuscateFiles([{path:'sample.cjs',sourceType:'commonjs',code:before}],{
    mode:'sno',seed:'primitive-coercer-proof-sample',strings:false
  }).files[0];
  assert.equal(result.metrics.objects,1);
  assert.equal(result.metrics.properties,2);
  assert.equal(result.code,after);
});

test('native and obfuscated sample agree on heterogeneous inputs',()=>{
  const original=load(before);
  const generated=load(after);
  for(const value of [0,1,-1,10,0.5,Number.NaN,Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,null,undefined,true,false,'4','invalid',3n,Symbol('x')]) {
    assert.deepEqual(outcome(()=>generated(value)),outcome(()=>original(value)),
      'input='+String(value));
  }
});

test('sample demonstrates transformed private fields without touching exported API',()=>{
  assert.match(before,/secretField:37/);
  assert.match(after,/_p[0-9a-f]{10}/);
  assert.doesNotMatch(after,/secretField|offset:5/);
  assert.match(after,/module\.exports=\{calculate\}/);
});
