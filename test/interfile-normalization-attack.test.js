'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {attack}=require('../sims/interfile-normalization-attack');

test('static adversary normalizes 20 private ESM graphs from public output alone',async()=>{
  const result=await attack(20);
  assert.equal(result.graphs,20);
  assert.equal(result.semanticClones,20);
  assert.ok(result.normalizedKeys>=40);
  assert.equal(result.originalNamesRecovered,0);
  assert.equal(result.nativeEqual,true);
});
