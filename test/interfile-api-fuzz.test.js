'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {runApiFuzz}=require('../sims/interfile-api-fuzz');

test('260 native ESM graphs retain behavior across sync/async forwarding, reflection and external APIs',async()=>{
  const result=await runApiFuzz(20);
  assert.equal(result.graphs,260);
  assert.equal(result.positive,20);
  assert.equal(result.negative,220);
  assert.equal(result.parityOnly,20);
  assert.ok(result.positiveProperties>=40);
  assert.equal(result.settledAsync,40);
  assert.equal(result.nativeEqual,true);
});
