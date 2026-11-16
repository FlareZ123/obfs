'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {runTimingOracleExperiment}=require('../sims/sco-timing-oracle');

test('authorized client recovers server-private 128-bit value from vulnerable timing but not fixed comparison', {timeout:420000},async()=>{
  const result=await runTimingOracleExperiment();
  assert.equal(result.sourceHidden,true);
  assert.equal(result.secretBits,128);
  assert.equal(result.directUnauthorizedStatus,403);
  assert.equal(result.unauthorizedExecutions,0);
  assert.equal(result.probesPerMode,1537);
  assert.equal(result.recoveredSecret,true);
  assert.equal(result.vulnerableFinalAccepted,true);
  assert.equal(result.constantTimeControlRecovered,false);
  assert.equal(result.controlFinalAccepted,false);
  assert.equal(result.within2_5x,true,
    'Actual source-private valid-work session exceeded 2.5x on this host');
  console.log('SCO_TIMING_ORACLE_RESULT '+JSON.stringify(result));
});
