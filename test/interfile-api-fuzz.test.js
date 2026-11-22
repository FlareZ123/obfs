'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {runApiFuzz}=require('../sims/interfile-api-fuzz');

test('180 native ESM graphs retain behavior across private, reflective, Proxy and external-API keys',async()=>{
  const result=await runApiFuzz(20);
  assert.equal(result.graphs,180);
  assert.equal(result.positive,20);
  assert.equal(result.negative,140);
  assert.equal(result.parityOnly,20);
  assert.ok(result.positiveProperties>=40);
  assert.equal(result.nativeEqual,true);
});
