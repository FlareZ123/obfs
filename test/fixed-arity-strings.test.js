'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');
const {parse}=require('../src/ast');
const {encodeStrings}=require('../src/strings');
const {recoverObfuscatedStrings}=require('../sims/static-string-recovery');

/**
 * @param {string} source
 * @param {string} [mutation]
 * @returns {string}
 */
function execute(source,mutation='') {
  const context=vm.createContext({module:{exports:''}});
  vm.runInContext(mutation+'\n'+source,context,{timeout:8000});
  return String(context.module.exports);
}

for(const mode of /** @type {const} */ (['sno','coo'])) {
  test('fixed-arity decoder preserves all 64 possible tail lengths in '+mode,()=>{
    const strings=Array.from({length:64},(_,index)=>
      'A'.repeat(1024+index)+'😀+String.fromCharCode(0xD800,0));
    const source='module.exports=JSON.stringify('+JSON.stringify(strings)+');';
    const output=obfuscateFiles([{path:'value.cjs',sourceType:'commonjs',code:source}],{
      mode,seed:'fixed-arity-64-tails/'+mode,strings:true,properties:false,
      identifiers:false,experimentalFixedArityStrings:true
    }).files[0];
    assert.equal(output.metrics.literals,64);
    assert.match(String(output.code),/fromCharCode\([^)]*charCodeAt/u);
    assert.doesNotMatch(String(output.code),/fromCharCode\(\.\.\./u);
    assert.equal(execute(String(output.code)),execute(source));
    const attacker=recoverObfuscatedStrings(String(output.code),'commonjs');
    assert.equal(attacker.tables,1,'fixed arity retains public XOR recovery');
    assert.equal(attacker.literals,64);
    assert.equal(execute(attacker.code),execute(source));
  });
}

for(const [name,mutation] of [
  ['Array prototype chain',
    'const shim={get 0(){return 0;},set 0(value){}};Array.prototype.__proto__=shim;'],
  ['Array index accessor',
    'Object.defineProperty(Array.prototype,"0",{configurable:true,get(){return 0;},set(value){}});'],
  ['Object index accessor',
    'Object.defineProperty(Object.prototype,"0",{configurable:true,get(){return 0;},set(value){}});']
]) {
  test('fixed-arity direct decoder avoids '+name+' inherited index writes',()=>{
    const long='A'+('😀\\uD800\\uDC00Z').repeat(410)+'tail';
    const source='module.exports='+JSON.stringify(long)+';';
    const ast=parse(source,'commonjs');
    const fast=encodeStrings(source,ast,{seed:'fixed-arity-direct/'+name,fixedArity:true});
    const spread=encodeStrings(source,ast,{seed:'fixed-arity-direct/'+name,fixedArity:false});
    assert.equal(fast.count,1);
    assert.equal(spread.count,1);
    assert.equal(execute(source,mutation),long);
    assert.equal(execute(fast.code,mutation),long);
    assert.notEqual(execute(spread.code,mutation),long,
      'legacy chunked spread must reproduce the pollution counterexample');

    // The whole-group compiler deliberately retains its earlier conservative
    // source-visible mutable-intrinsic refusal, even for this opt-in backend.
    const files=[
      {path:'mutator.cjs',sourceType:/** @type {const} */ ('commonjs'),code:mutation},
      {path:'target.cjs',sourceType:/** @type {const} */ ('commonjs'),code:source}
    ];
    const output=obfuscateFiles(files,{mode:'sno',strings:true,
      properties:false,identifiers:false,seed:'fixed-arity-whole/'+name,
      experimentalFixedArityStrings:true});
    assert.equal(output.files[1].metrics.literals,0);
  });
}

test('fixed-arity option keeps short-only decoder and default strategy unchanged',()=>{
  const source='module.exports="small-and-static";';
  const result=obfuscateFiles([{path:'short.cjs',sourceType:'commonjs',code:source}],{
    mode:'sno',seed:'short-fixed-arity',strings:true,properties:false,
    identifiers:false,experimentalFixedArityStrings:true
  }).files[0];
  assert.equal(result.metrics.literals,1);
  assert.equal(execute(String(result.code)),execute(source));
  assert.doesNotMatch(String(result.code),/\+=64/u);
  const long='b'.repeat(2049);
  const legacy=obfuscateFiles([{path:'long.cjs',sourceType:'commonjs',
    code:'module.exports='+JSON.stringify(long)+';'}],{
    mode:'sno',seed:'old-spread-still-default',strings:true,
    properties:false,identifiers:false
  }).files[0];
  assert.match(String(legacy.code),/String\.fromCharCode\(\.\.\./u);
});
