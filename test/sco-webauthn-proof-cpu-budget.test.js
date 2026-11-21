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
  assert.deepEqual(result.profiles.map(p=>p.aggregation),[8,8]);
  assert.deepEqual(result.profiles.map(p=>p.timedOperations),[32000,480]);
  for(const p of result.profiles){
    assert.equal(p.samples.length,7);
    assert.ok(p.serverCpuRatio>0&&Number.isFinite(p.serverCpuRatio));
    for(const sample of p.samples){
      assert.equal(sample.original.checksum,sample.proof.checksum);
      assert.ok(sample.original.cpuUs>0&&sample.proof.cpuUs>0);
    }
  }
  process.stdout.write('SCO_WEBAUTHN_SERVER_CPU '+JSON.stringify(result)+'\n');
});
