'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {pairedBudgetBound,orderStatisticRank}=require('../sims/paired-budget-bound');

test('exact binomial order statistics attain their declared one-sided median coverage',()=>{
  assert.deepEqual(orderStatisticRank(5,0.95),{rank:5,coverage:31/32});
  assert.deepEqual(orderStatisticRank(7,0.95),{rank:7,coverage:127/128});
  assert.deepEqual(orderStatisticRank(9,0.95),{rank:8,coverage:502/512});
  assert.deepEqual(orderStatisticRank(12,0.95),{
    rank:10,coverage:4017/4096
  });
  assert.throws(()=>orderStatisticRank(4,0.95),/Too few/);
  assert.throws(()=>orderStatisticRank(0,0.95),/Sample count/);
  assert.throws(()=>orderStatisticRank(9,1),/Confidence/);
});

test('paired ratio bound separates supported, exceeded and inconclusive budgets',()=>{
  const native=Array(9).fill(1);
  const supported=pairedBudgetBound(native,[1.1,1.2,1.3,1.4,1.5,1.6,1.7,1.8,1.9]);
  assert.equal(supported.decision,'supported');
  assert.equal(supported.upperRank,8);
  assert.equal(supported.lowerMedianBound,1.2);
  assert.equal(supported.upperMedianBound,1.8);
  assert.equal(supported.samplePairs,9);
  assert.equal(supported.observedPairsWithinBudget,9);

  const inconclusive=pairedBudgetBound(Array(7).fill(1),
    [2.1,2.2,2.4,2.6,2.7,2.8,3.0]);
  assert.equal(inconclusive.decision,'inconclusive');
  assert.equal(inconclusive.lowerMedianBound,2.1);
  assert.equal(inconclusive.upperMedianBound,3);
  assert.equal(inconclusive.medianOfPairedRatios,2.6);

  const exceeded=pairedBudgetBound([1,2,3,4,5,6,7,8,9],
    [3,6,9,12,15,18,21,24,27]);
  assert.equal(exceeded.decision,'exceeded');
  assert.equal(exceeded.ratioOfMedians,3);
  assert.equal(exceeded.lowerMedianBound,3);
  assert.equal(exceeded.upperMedianBound,3);
});

test('paired budget analysis refuses incompatible or invalid measured durations',()=>{
  assert.throws(()=>pairedBudgetBound([1,2,3,4,5],[1,2,3]),/five matching/);
  assert.throws(()=>pairedBudgetBound([1,2,3,4,0],[1,2,3,4,5]),/positive/);
  assert.throws(()=>pairedBudgetBound([1,2,3,4,5],[1,2,3,4,Infinity]),/positive/);
  assert.throws(()=>pairedBudgetBound([1,2,3,4,5],[1,2,3,4,5],{threshold:0}),/threshold/);
  assert.throws(()=>pairedBudgetBound([1,2,3,4,5],[1,2,3,4,5],{confidence:0.999}),/Too few/);
});
