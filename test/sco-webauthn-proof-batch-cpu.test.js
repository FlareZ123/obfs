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
    assert.equal(profile.pairedRatios.length,7);
    assert.equal(profile.maxPairRatio,Math.max(...profile.pairedRatios));
    assert.equal(profile.pairBreachesOver2_5x,
      profile.pairedRatios.filter(ratio=>ratio>2.5).length);
    assert.equal(profile.strictAllPairsWithin2_5x,
      profile.pairBreachesOver2_5x===0);
    for(const [index,sample] of profile.samples.entries()){
      assert.equal(profile.pairedRatios[index],
        sample.proof.cpuUs/sample.original.cpuUs);
      assert.equal(sample.original.checksum,sample.proof.checksum);
      assert.ok(sample.original.cpuUs>0&&sample.proof.cpuUs>0);
    }
  }
  assert.equal(result.placebo.samples.length,7);
  assert.equal(result.placebo.pairedRatios.length,7);
  assert.equal(result.placebo.strictBreachesOver2_5x,
    result.placebo.pairedRatios.filter(ratio=>ratio>2.5).length);
  assert.equal(result.placebo.maxPairRatio,
    Math.max(...result.placebo.pairedRatios));
  for(const [index,sample] of result.placebo.samples.entries()){
    assert.equal(result.placebo.pairedRatios[index],
      sample.secondCpuUs/sample.firstCpuUs);
  }
  process.stdout.write('SCO_WEBAUTHN_BATCH_CPU '+JSON.stringify(result)+'\n');
});
