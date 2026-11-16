'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {runLiveStepVersionSpace}=require('../sims/sco-step-only-live-rpc');

test('real authenticated SCO facade supports a public-only two-state continuation clone',async()=>{
  const result=await runLiveStepVersionSpace(2,0x31415926);
  assert.equal(result.states,2);
  assert.equal(result.certified,true);
  assert.equal(result.sourceDisclosed,false);
  assert.equal(result.unauthorizedStatus,403);
  assert.equal(result.publicResetExport,false);
  assert.equal(result.distinctSourceFiles,true);
  assert.equal(result.knownContinuationExact,true);
  assert.ok(result.queries>0&&result.queries<=64);
  assert.equal(result.networkSteps,result.queries+16);
});

test('real generated SCO facade supports three hidden states with no reset endpoint',async()=>{
  const result=await runLiveStepVersionSpace(3,0xa82b11f5);
  assert.equal(result.states,3);
  assert.equal(result.certified,true);
  assert.equal(result.sourceDisclosed,false);
  assert.equal(result.unauthorizedStatus,403);
  assert.equal(result.publicResetExport,false);
  assert.equal(result.knownContinuationExact,true);
  assert.ok(result.queries>0&&result.queries<=64);
  assert.equal(result.networkSteps,result.queries+16);
});

test('invalid private SCO scenario parameters are refused without starting a service',async()=>{
  await assert.rejects(()=>runLiveStepVersionSpace(4),RangeError);
  await assert.rejects(()=>runLiveStepVersionSpace(2,-1),RangeError);
});
