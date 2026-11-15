'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {runApiFuzz}=require('../sims/interfile-api-fuzz');

test('120 native ESM graphs retain behavior across private, reflective and external-API keys',async()=>{
  const result=await runApiFuzz(20);
  assert.equal(result.graphs,120);
  assert.equal(result.positive,20);
  assert.equal(result.negative,100);
  assert.ok(result.positiveProperties>=40);
  assert.equal(result.nativeEqual,true);
});
