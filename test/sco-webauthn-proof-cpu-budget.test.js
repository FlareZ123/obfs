'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {runBudgetProbe,nativeKernel}=require('../sims/sco-webauthn-proof-cpu-budget');

test('deterministic native kernel preserves signed int32 output',()=>{
  assert.equal(nativeKernel(7,0),7);
  for(const rounds of [1,500,250000]){
    assert.ok(Number.isInteger(nativeKernel(11,rounds)));
  }
});

test('paired server-only WebAuthn signature verification CPU screen',()=>{
  const result=runBudgetProbe();
  assert.equal(result.profiles.length,2);
  assert.equal(result.limits.browserCpuIncluded,false);
  assert.equal(result.limits.networkCpuIncluded,false);
  assert.deepEqual(result.profiles.map(p=>p.repeats),[7,7]);
  assert.deepEqual(result.profiles.map(p=>p.operations),[4000,60]);
  for(const p of result.profiles){
    // CPU time may be quantized on a Windows runner. The calibration
    // grows paired native/proof workloads together until both are
    // measurable, and reports the exact number of discarded attempts.
    assert.ok(Number.isInteger(p.resolutionRetries));
    assert.ok(p.resolutionRetries>=0&&p.resolutionRetries<=3);
    assert.equal(p.aggregation,8*(2**p.resolutionRetries));
    assert.equal(p.timedOperations,p.operations*p.aggregation);
    assert.equal(p.samples.length,7);
    assert.ok(p.serverCpuRatio>0&&Number.isFinite(p.serverCpuRatio));
    for(const sample of p.samples){
      assert.equal(sample.original.checksum,sample.proof.checksum);
      assert.ok(sample.original.cpuUs>0&&sample.proof.cpuUs>0);
    }
  }
  process.stdout.write('SCO_WEBAUTHN_SERVER_CPU '+JSON.stringify(result)+'\n');
});
