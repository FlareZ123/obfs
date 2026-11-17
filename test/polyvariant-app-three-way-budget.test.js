'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {prepare,runEvidence}=require('../sims/polyvariant-app-three-way-budget');

test('attacker rebuild is derived only from published math bytes',async()=>{
  const {variants,recoveredFunctions,attackMs,
    originalSha256,publishedSha256,reconstructedSha256}=await prepare();
  assert.equal(recoveredFunctions,3);
  assert.ok(attackMs>=0);
  assert.match(originalSha256,/^[a-f0-9]{64}$/);
  assert.match(publishedSha256,/^[a-f0-9]{64}$/);
  assert.match(reconstructedSha256,/^[a-f0-9]{64}$/);
  assert.notEqual(originalSha256,publishedSha256);
  assert.notEqual(publishedSha256,reconstructedSha256);
  assert.equal(variants.native.length,3);
  assert.deepEqual(variants.reconstructed.slice(1),variants.published.slice(1));
  assert.ok(variants.published[0].code.includes('_ap_input_'));
  assert.ok(!variants.reconstructed[0].code.includes('_ap_input_'));
});

test('full COO app parity and paired runtime evidence survive independent public-source reconstruction',{
  timeout:120000
},async()=>{
  const result=await runEvidence();
  assert.equal(result.functionRecovery,3);
  assert.equal(result.rounds,9);
  assert.equal(result.programs,3);
  assert.deepEqual(result.rows.map(row=>row.events),[1,50,1000,10000]);
  for(const row of result.rows){
    assert.equal(row.comparisons,27);
    assert.deepEqual(row.sourceBytes,{
      native:2467,published:7518,reconstructed:2362
    });
    assert.equal(row.publishedVsNative.samplePairs,9);
    assert.equal(row.reconstructedVsNative.samplePairs,9);
    for(const kind of ['native','published','reconstructed']){
      const times=row.rawSamples[/** @type {keyof typeof row.rawSamples} */(kind)];
      assert.equal(times.length,9);
      assert.ok(times.every(t=>Number.isFinite(t)&&t>0));
    }
    assert.ok(Number.isFinite(row.ratioReconstructedToPublishedMedians));
  }
});
