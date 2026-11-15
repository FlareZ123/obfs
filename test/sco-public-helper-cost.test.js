'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {runCost}=require('../sims/sco-public-helper-cost');

test('SCO mixed helper costs report native/HTTP thin and amortized workloads',async()=>{
  const result=await runCost();
  assert.equal(result.thinCalls,64);
  assert.equal(result.sessionCalls,350000);
  for(const key of ['thinNativeMedianMs','thinClientMedianMs','thinRatio',
    'sessionNativeMedianMs','sessionClientMedianMs','sessionRatio']){
    const value=result[/** @type {keyof typeof result} */ (key)];
    assert.equal(typeof value,'number');
    assert.ok(Number.isFinite(value)&&value>0,key+' must be finite and positive');
  }
  assert.equal(result.thinWithinBudget,result.thinRatio<=2.5);
  assert.equal(result.sessionWithinBudget,result.sessionRatio<=2.5);
});
