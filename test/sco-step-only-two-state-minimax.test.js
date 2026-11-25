'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {distinguish}=require('../sims/sco-step-only-version-space');
const {observationWords,buildBehaviorTypes,advance,analyzeTwoStateMinimax}=
  require('../sims/sco-step-only-two-state-minimax');
const {analyzeTwoStateExpectedQueries}=require('../sims/sco-step-only-two-state-expected');

test('four-step binary signatures exactly match independent product-BFS behavior',()=>{
  assert.equal(observationWords().length,30);
  const {rooted,types,outputs,successors}=buildBehaviorTypes();
  assert.equal(rooted.length,516);
  assert.equal(outputs.length,148);
  assert.equal(successors.length,148);
  for(let left=0;left<rooted.length;left++)for(let right=0;right<left;right++){
    const a={...rooted[left].model,state:rooted[left].state};
    const b={...rooted[right].model,state:rooted[right].state};
    assert.equal(types[left]===types[right],distinguish(a,b)===null,
      `rooted pair ${left}/${right}`);
  }
  for(let type=0;type<outputs.length;type++)for(const symbol of [0,1]){
    assert.deepEqual(advance(1n<<BigInt(type),symbol,outputs,successors),
      [1n<<BigInt(successors[type][symbol])]);
  }
});

test('all two-state binary models require nine queries in the minimax worst case',()=>{
  const result=analyzeTwoStateMinimax();
  assert.equal(result.sourceModels,260);
  assert.equal(result.rootedVariants,516);
  assert.equal(result.behaviorTypes,148);
  assert.equal(result.reachableBeliefs,1713);
  assert.equal(result.winningBeliefs,1713);
  assert.deepEqual(result.layerSizes,[344,216,312,316,240,156,24,8,1]);
  assert.equal(result.minimaxQueries,9);
  assert.equal(result.heuristicWorstCase,9);
  assert.equal(result.heuristicHistogram.reduce((sum,n)=>sum+n,0),260);
  console.log('SCO_TWO_STATE_MINIMAX '+JSON.stringify(result));
});


test('weighted posterior policy improves calls and reaches a finite global Bellman fixed point',()=>{
  const result=analyzeTwoStateExpectedQueries();
  assert.equal(result.weightedBeliefs,2365);
  assert.equal(result.unboundedConverged,true);
  assert.equal(result.convergenceDepth,11);
  assert.equal(result.baselineTotal,1992);
  assert.equal(result.boundedNineTotal,1884);
  assert.equal(result.optimalTotal,1776);
  assert.deepEqual(result.nineHistogram,[0,0,0,0,0,0,40,156,24,40]);
  assert.deepEqual(result.optimalHistogram,[0,0,0,0,0,16,132,48,32,8,24]);
  assert.equal(result.nineHistogram.reduce((s,n)=>s+n,0),260);
  assert.equal(result.optimalHistogram.reduce((s,n)=>s+n,0),260);
  console.log('SCO_TWO_STATE_WEIGHTED '+JSON.stringify(result));
});
