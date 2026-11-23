'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {
  chainPermutation,inverseChainPermutation,runEvidence
}=require('../sims/reanchor-depth-tightness');

test('32-bit compatible nonlinear chain reaches the strengthened 64-query bound',()=>{
  const evidence=runEvidence();
  assert.equal(evidence.target,3);
  assert.equal(evidence.recovered,0xffffffff);
  assert.equal(evidence.anchor,0);
  assert.equal(evidence.corrections,30);
  assert.equal(evidence.queries,64);
  assert.equal(evidence.identityColumns,true);
  assert.equal(evidence.candidateFormulaHolds,true);
  // At the anchor, the differential is identity, yet this is
  // genuinely nonlinear: P(3)=7 instead of P(1)^P(2)^P(0)=3.
  assert.notEqual(chainPermutation(3),
    chainPermutation(1)^chainPermutation(2)^chainPermutation(0));
  console.log('REANCHOR_DEPTH '+JSON.stringify(evidence));
});

test('independent triangular inverse holds for edge and seeded 32-bit inputs',()=>{
  for(const word of [0,1,2,3,0x80000000,0xffffffff]) {
    assert.equal(inverseChainPermutation(chainPermutation(word)),word);
  }
  let state=0x12345678;
  for(let index=0;index<4096;index++) {
    state=(Math.imul(state,1664525)+1013904223)>>>0;
    assert.equal(inverseChainPermutation(chainPermutation(state)),state,
      'Triangular forward/inverse disagreement at sample '+index);
  }
});
