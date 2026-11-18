'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {runSparseCounterexample}=require('../sims/compatible-permutation-linear-sandwich-sparse-counterexample');

test('sampling-certified two-sided sandwich attack refuses rare-trigger false flag',()=>{
  const result=runSparseCounterexample();
  assert.equal(result.error,'sandwich inversion failed final equality');
  assert.ok(result.oracleQueries>14000);
});
