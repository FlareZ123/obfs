'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {pareto,analyzeTwoStatePareto}=require('../sims/sco-step-only-two-state-pareto');

test('Pareto pruning removes dominated and duplicate source/semantic cost pairs',()=>{
  assert.deepEqual(pareto([[4,7],[4,9],[5,6],[3,7],[3,8],[6,6]]),
    [[3,7],[5,6]]);
  assert.deepEqual(pareto([[1,Infinity],[Infinity,2]]),[]);
});

test('exhaust all nondominated bounded no-reset two-state source/behavior prior strategies',()=>{
  const result=analyzeTwoStatePareto();
  assert.deepEqual(result,{
    sourceModels:260,beliefStates:4429,semanticScale:29,
    nineFrontier:[[1884,31900],[1911,31871],[1938,31842],[1965,31813],[1992,31784]],
    tenFrontier:[[1776,32016],[1799,31871],[1822,31726],[1845,31581],[1868,31436]],
    elevenFrontier:[[1776,32016],[1799,31871],[1822,31726],[1845,31581],[1868,31436]],
    maxLocalFrontier:5,maxLocalCandidates:18
  });
  console.log('SCO_TWO_STATE_PARETO '+JSON.stringify(result));
});
