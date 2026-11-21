'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {runBatchedBudgetProbe}=require('../sims/sco-webauthn-proof-batch-cpu');

test('same native outputs with 32 or 128 original operations per signed proof',()=>{
  const result=runBatchedBudgetProbe();
  assert.equal(result.limits.browserSigningIncluded,false);
  assert.equal(result.limits.challengeSerializationIncluded,false);
  assert.deepEqual(result.profiles.map(x=>x.proofBatchSize),[32,128]);
  for(const profile of result.profiles){
    assert.equal(profile.rounds,500);
    assert.equal(profile.operations,4000);
    assert.equal(profile.aggregation,32);
    assert.equal(profile.timedOperations,128000);
    assert.equal(profile.repeats,7);
    assert.ok(Number.isFinite(profile.serverCpuRatio)&&profile.serverCpuRatio>0);
    for(const sample of profile.samples){
      assert.equal(sample.original.checksum,sample.proof.checksum);
      assert.ok(sample.original.cpuUs>0&&sample.proof.cpuUs>0);
    }
  }
  process.stdout.write('SCO_WEBAUTHN_BATCH_CPU '+JSON.stringify(result)+'\n');
});
