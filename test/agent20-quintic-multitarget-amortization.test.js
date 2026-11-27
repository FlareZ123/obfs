'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {runEvidence}=require('../sims/agent20-quintic-multitarget-amortization');

test('amortized rank-two and reanchor inversion use shared bases across the same eight quintic targets',()=>{
  const result=runEvidence();
  assert.equal(result.width,32);
  assert.equal(result.degree,5);
  assert.equal(result.targetCount,8);
  assert.deepEqual(result.sourceAudit,{
    affineRank:32,
    nonlinearOutputRank:2,
    canonicalAnchorRank:31,
    successfulAnchorCompatibleB:true
  });
  assert.deepEqual(result.reanchor.failedAnchors,[
    {anchor:'0x477d20b7',rank:31,queries:33},
    {anchor:'0x8e1d9142',rank:31,queries:66}
  ]);
  assert.equal(result.reanchor.successfulAnchor,'0xba8c2458');
  assert.deepEqual(result.reanchor.perTarget.map(x=>[x.corrections,x.checks]),
    Array.from({length:8},()=>[1,2]));
  assert.equal(result.reanchor.uniqueOracleQueries,115);
  assert.equal(result.rankTwo.rankBound,2);
  assert.equal(result.rankTwo.affineNullity,1);
  assert.equal(result.rankTwo.orbitBound,8);
  assert.deepEqual(result.rankTwo.perTarget.map(x=>x.orbitCalls),[6,7,1,7,2,7,3,7]);
  assert.equal(result.rankTwo.uniqueOracleQueries,73);
});
