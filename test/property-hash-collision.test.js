'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {obfuscateFiles} = require('../src');

/** @param {string} code @returns {string} */
function evaluate(code) {
  const realm={module:{exports:null}};
  vm.runInNewContext(code,realm,{timeout:1000});
  return JSON.stringify(realm.module.exports);
}

test('a 40-bit SHA-256 output collision cannot merge two own object fields',()=>{
  // Precomputed against sha256('collision-proof/entry.cjs'), then the local
  // object key hash sha256(`${salt}/state/12/${propertyName}`).
  // Distinct keys f1846430 and f2018180 both map to _p2b622f8ab7.
  const source='const state={f1846430:1,f2018180:2};module.exports=[state.f1846430,state.f2018180];';
  assert.equal(source.indexOf('{'),12);
  const output=obfuscateFiles([
    {path:'entry.cjs',sourceType:'commonjs',code:source}
  ],{mode:'sno',seed:'collision-proof',strings:false,identifiers:false}).files[0];
  assert.equal(evaluate(source),'[1,2]');
  assert.equal(evaluate(output.code),evaluate(source),output.code);
  assert.equal(output.metrics.objects,0,'Colliding generated names must block this object');
  assert.equal(output.metrics.properties,0);
});

test('a noncolliding sibling object retains beneficial property renaming',()=>{
  const source='const state={f1846430:1,normalField:2};module.exports=[state.f1846430,state.normalField];';
  const output=obfuscateFiles([
    {path:'entry.cjs',sourceType:'commonjs',code:source}
  ],{mode:'sno',seed:'collision-proof',strings:false,identifiers:false}).files[0];
  assert.equal(evaluate(output.code),evaluate(source));
  assert.equal(output.metrics.objects,1);
  assert.equal(output.metrics.properties,2);
});
