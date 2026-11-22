'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {runEvidence}=require('../sims/compatible-linear-baseline-width3-peer');

test('width-three exhaustive compatible linear baseline preserves bounded exact inversion',()=>{
  const result=runEvidence();
  assert.equal(result.compatiblePermutations,128);
  assert.equal(result.innerLinearMaps,168);
  assert.equal(result.outerMaps,2);
  assert.equal(result.innerOffsets,2);
  assert.equal(result.compatibleLinearBaselines,8);
  assert.equal(result.sourceCleanConfigurations,4992);
  assert.equal(result.exactRecoveries,638976);
  assert.equal(result.nonIdentityBaselineRecoveries,559104);
  assert.ok(result.sourceMismatches>0);
  assert.ok(result.maxQueries<=7);
  console.log('COMPATIBLE_BASELINE_WIDTH3 '+JSON.stringify(result));
});
