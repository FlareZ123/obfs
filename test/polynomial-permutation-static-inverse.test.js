'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {
  makeSample,
  recoverSecretFromSource,
  runRecoveryMatrix
}=require('../sims/polynomial-permutation-static-inverse');

test('public minified Rivest-family polynomial equality is structurally invertible',()=>{
  for(const seed of [
    'integration-polynomial-a',
    'integration-polynomial-b',
    'integration-polynomial-c'
  ]){
    const sample=makeSample(seed);
    const recovered=recoverSecretFromSource(sample.source);
    assert.equal(recovered.secret,sample.secret);
    assert.ok(recovered.evaluations<=64,JSON.stringify(recovered));
  }
});

test('held-out randomized polynomial source recovery remains complete',()=>{
  const result=runRecoveryMatrix(16);
  assert.equal(result.samples,16);
  assert.equal(result.recovered,16);
  assert.ok(result.maxEvaluations<=64,JSON.stringify(result));
});
