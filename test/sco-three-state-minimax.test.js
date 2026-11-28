'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {computeThreeStateMinimax}=
  require('../sims/sco-three-state-minimax');

test('the complete at-most-three-state binary Mealy class has exact minimax cost 24',()=>{
  const result=computeThreeStateMinimax();
  assert.equal(result.modelCount,46656);
  assert.equal(result.behaviorClasses,11500);
  assert.equal(result.initialClasses,11500);
  assert.equal(result.minimaxQueries,24);
  assert.equal(result.noStrategyWithin23,true);
  assert.equal(result.strategyWithin24,true);
  assert.deepEqual(result.statesAfterBudget23,{visited:2488929,cacheHits:914343});
  assert.deepEqual(result.statesAfterBudget24,{visited:4443360,cacheHits:1578390});
  assert.equal(result.policyNodes,13329);
  assert.equal(result.terminalLeaves,6628);
  assert.equal(result.maxQueries,24);
  assert.equal(result.totalMemoEntries,4443360);
  assert.equal(result.sourceReplay.models,46656);
  assert.ok(result.sourceReplay.minQueries>=1);
  assert.equal(result.sourceReplay.maxQueries,24);
  assert.equal(result.sourceReplay.histogram.reduce((sum,count)=>sum+count,0),46656);
});
