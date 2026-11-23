'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {planZeroBreachSamples}=require('../sims/strict-tail-power');

/** @param {number} n @param {number} confidence @param {number} workloads @returns {number} */
function independentlyComputedBound(n,confidence,workloads) {
  return 1-Math.exp(Math.log((1-confidence)/workloads)/n);
}

test('fixed 12-population 95% sample-size power table',()=>{
  assert.equal(planZeroBreachSamples(.1,.95,12).pairsPerWorkload,53);
  assert.equal(planZeroBreachSamples(.05,.95,12).pairsPerWorkload,107);
  assert.equal(planZeroBreachSamples(.01,.95,12).pairsPerWorkload,546);
  assert.equal(planZeroBreachSamples(.001,.95,12).pairsPerWorkload,5478);
  const p=planZeroBreachSamples(.01,.95,12);
  assert.equal(p.totalPairs,6552);
  assert.ok(p.upperRateAtPlan<=.01);
  assert.ok(p.upperRateAtOneFewer!==null && p.upperRateAtOneFewer>.01);
});

test('all plans are minimal and agree with independent binomial inversion',()=>{
  for(const workloadCount of [1,2,6,10,12,100]) {
    for(const confidence of [.5,.8,.95,.99]) {
      for(const maxBreachRate of [.001,.01,.05,.1,.3,.9]) {
        const plan=planZeroBreachSamples(maxBreachRate,confidence,workloadCount);
        assert.ok(plan.upperRateAtPlan<=maxBreachRate+1e-15);
        assert.ok(plan.upperRateAtOneFewer===null||
          plan.upperRateAtOneFewer>maxBreachRate-1e-15);
        assert.ok(Math.abs(plan.upperRateAtPlan-
          independentlyComputedBound(plan.pairsPerWorkload,confidence,workloadCount))<1e-13);
      }
    }
  }
});

test('9 and 13 breach-free pairs leave large simultaneous risk bounds',()=>{
  const bound9=independentlyComputedBound(9,.95,12);
  const bound13=independentlyComputedBound(13,.95,12);
  assert.ok(bound9>.45&&bound9<.46);
  assert.ok(bound13>.34&&bound13<.35);
  assert.ok(bound13<bound9);
});

test('invalid assumptions and unrepresentable sample counts refuse',()=>{
  for(const rate of [0,1,-.1,NaN,Infinity])
    assert.throws(()=>planZeroBreachSamples(rate,.95,12),RangeError);
  for(const confidence of [0,1,-.1,NaN,Infinity])
    assert.throws(()=>planZeroBreachSamples(.01,confidence,12),RangeError);
  for(const count of [0,-1,1.2,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])
    assert.throws(()=>planZeroBreachSamples(.01,.95,count),RangeError);
  assert.throws(()=>planZeroBreachSamples(Number.MIN_VALUE,.95,12),RangeError);
});
