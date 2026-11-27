'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {runEvidence}=require('../sims/reanchor-depth-width3-exhaustive');

test('independent exhaustive three-bit compatible reanchoring proves 2n finite bound',()=>{
  const e=runEvidence();
  assert.equal(e.triangularPermutations,128);
  assert.equal(e.inputLinearMaps,168);
  assert.equal(e.sourceAnchors,172032);
  assert.equal(e.singularAnchors,12288);
  assert.equal(e.fullRankIncompatibleAnchors,0);
  assert.equal(e.admissibleAnchors,159744);
  assert.equal(e.verifiedTargets,1277952);
  assert.equal(e.zeroCorrection,1130496);
  assert.equal(e.oneCorrection,147456);
  assert.deepEqual(e.queryHistogram,{'4':638976,'5':491520,'6':147456});
  assert.equal(e.maxDistinctQueries,6);
  console.log('REANCHOR_WIDTH3 '+JSON.stringify(e));
});
