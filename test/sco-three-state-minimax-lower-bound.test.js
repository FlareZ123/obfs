'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {computeThreeStateLowerBound}=
  require('../sims/sco-three-state-minimax-lower-bound');

test('complete three-state behavior quotient proves a ten-query worst-case lower bound',()=>{
  const result=computeThreeStateLowerBound();
  assert.equal(result.modelCount,46656);
  assert.equal(result.behaviorClassCount,11500);
  assert.equal(result.initialClassCount,11500);
  assert.deepEqual(result.beliefNodesByDepth,
    [1,4,16,64,248,956,3632,13216,45656,135212]);
  assert.deepEqual(result.survivalCounts,
    [63645,18133,4917,1289,333,85,21,5,1]);
  assert.equal(result.rootSurvivesNineQueries,true);
  assert.equal(result.worstCaseLowerBound,10);
  assert.equal(result.adversarialInputSequences,512);
  assert.equal(result.minimumFinalBehaviorClasses,59);
  assert.equal(result.maximumFinalBehaviorClasses,1930);
  assert.deepEqual(result.zeroInputTranscript,{
    inputs:[0,0,0,0,0,0,0,0,0],
    outputs:[0,0,0,0,0,0,0,0,0],
    survivingModels:14256,
    survivingBehaviorClasses:1930,
    firstSurvivingModel:0
  });
});
