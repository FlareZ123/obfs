'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {clusterStrictTail}=require('../sims/cluster-strict-tail');

/**
 * @param {number} blocks
 * @param {number} pairsPerBlock
 * @returns {import('../sims/cluster-strict-tail').ClusteredWorkload}
 */
function safeWorkload(blocks,pairsPerBlock){
  return {pairs:Array.from({length:blocks*pairsPerBlock},(_,index)=>({
    native:10,candidate:10,blockId:'process-'+Math.floor(index/pairsPerBlock)
  }))};
}

test('thirteen in-process pairs count as one independent block, not thirteen',()=>{
  const data=Array.from({length:12},()=>safeWorkload(1,13));
  const result=clusterStrictTail(data);
  assert.equal(result.comparisons,12);
  assert.equal(result.hasObservedStrictBreach,false);
  assert.equal(result.rows[0].observedPairs,13);
  assert.equal(result.rows[0].independentBlocksDeclared,1);
  assert.equal(result.rows[0].pairsPerBlock,13);
  assert.ok(Math.abs(/** @type {number} */(result.rows[0].futureBlockBreachRateUpperWhenZero)-
    (1-.05/12))<1e-12);
  const independent=clusterStrictTail(Array.from({length:12},()=>safeWorkload(13,1)));
  assert.ok(/** @type {number} */(independent.rows[0].futureBlockBreachRateUpperWhenZero)<.35);
  assert.ok(/** @type {number} */(independent.rows[0].futureBlockBreachRateUpperWhenZero)>.34);
});

test('one strict observed pair vetoes its entire block, including equality boundary',()=>{
  const workloads=[safeWorkload(3,4),safeWorkload(3,4)];
  workloads[0].pairs[3].candidate=25;
  workloads[0].pairs[7].candidate=25.000001;
  workloads[1].pairs[2].candidate=26;
  const result=clusterStrictTail(workloads);
  assert.equal(result.strictObservedOverBudgetPairs,2);
  assert.equal(result.strictObservedOverBudgetBlocks,2);
  assert.equal(result.rows[0].observedOverBudgetPairs,1);
  assert.equal(result.rows[0].observedOverBudgetBlocks,1);
  assert.equal(result.rows[1].observedOverBudgetPairs,1);
  assert.equal(result.rows[1].observedOverBudgetBlocks,1);
  assert.equal(result.rows[0].futureBlockBreachRateUpperWhenZero,null);
  assert.equal(result.rows[1].futureBlockBreachRateUpperWhenZero,null);
  assert.equal(result.hasObservedStrictBreach,true);
});

test('block breach upper bound shrinks with independent blocks, not repeated samples',()=>{
  for(const n of [1,2,3,9,13,53,546]){
    const one=clusterStrictTail([safeWorkload(n,1)]);
    const many=clusterStrictTail([safeWorkload(n,17)]);
    assert.ok(Math.abs(/** @type {number} */(one.rows[0].futureBlockBreachRateUpperWhenZero)-
      /** @type {number} */(many.rows[0].futureBlockBreachRateUpperWhenZero))<1e-14);
    const bound=/** @type {number} */(one.rows[0].futureBlockBreachRateUpperWhenZero);
    assert.ok(Math.abs(bound-(1-Math.pow(.05,1/n)))<1e-13);
  }
});

test('invalid controls, timing and non-identical block exposures refuse',()=>{
  assert.throws(()=>clusterStrictTail([]),TypeError);
  assert.throws(()=>clusterStrictTail([{pairs:[]}]),TypeError);
  for(const confidence of [0,1,-1,NaN,Infinity])
    assert.throws(()=>clusterStrictTail([safeWorkload(2,1)],{confidence}),RangeError);
  for(const threshold of [0,-1,NaN,Infinity])
    assert.throws(()=>clusterStrictTail([safeWorkload(2,1)],{threshold}),RangeError);
  for(const value of [0,-1,NaN,Infinity]){
    const input=safeWorkload(2,1);
    input.pairs[0].native=value;
    assert.throws(()=>clusterStrictTail([input]),RangeError);
  }
  const badIds=safeWorkload(2,1);
  badIds.pairs[1].blockId='';
  assert.throws(()=>clusterStrictTail([badIds]),TypeError);
  const unequal=safeWorkload(2,2);
  unequal.pairs[0].blockId='process-two';
  assert.throws(()=>clusterStrictTail([unequal]),RangeError);
});
