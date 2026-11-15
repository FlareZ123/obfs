'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/** @param {string} source @returns {unknown} */
function execute(source){
  const state={module:{exports:null}};
  vm.runInNewContext(source,state,{timeout:3000});
  return state.module.exports;
}

test('COO and SCO avoid eager runtime string decoding unless opted in',()=>{
  const source='module.exports='+JSON.stringify('alpha'.repeat(10000))+';';
  for(const mode of ['coo','sco']){
    const output=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:source}],{mode,seed:'cold-profile'}).files[0];
    assert.equal(output.metrics.literals,0);
    assert.equal(execute(output.code),execute(source));
    assert.ok(output.code.length<=source.length*1.1);
  }
  const opted=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:source}],{
    mode:'coo',seed:'cold-profile',strings:true
  }).files[0];
  assert.ok(opted.metrics.literals>0);
  assert.equal(execute(opted.code),execute(source));
});

test('SNO can opt into amortized startup decoding by default',()=>{
  const source='module.exports='+JSON.stringify('alpha'.repeat(1000))+';';
  const output=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:source}],{mode:'sno',seed:'sno-cold'}).files[0];
  assert.ok(output.metrics.literals>0);
  assert.equal(execute(output.code),execute(source));
});
