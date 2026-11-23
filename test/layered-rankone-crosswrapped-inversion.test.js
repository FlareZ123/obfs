'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {runLayeredLowRankComposition,runTinyLayeredAnfAudit}=
  require('../sims/layered-rankone-crosswrapped-inversion');

test('interleaved independently mixed nonlinear rank-one layers remain bounded-rank invertible',()=>{
  const result=runLayeredLowRankComposition();
  assert.equal(result.sources,60);
  assert.equal(result.targets,180);
  assert.equal(result.exactInversions,180);
  assert.equal(result.residualRankViolations,0);
  assert.equal(result.byLayers.length,5);
  for(const row of result.byLayers){
    assert.equal(row.sources,12);
    assert.equal(row.targets,36);
    assert.ok(row.maxCalls<=33+2**(2*row.layers));
    assert.ok(row.maximumResidualRank<=row.layers);
  }
  console.log('LAYERED_LOWRANK_COMPOSITION '+JSON.stringify(result));
});

test('complete eight-bit ANF audit: nonlinear degree rises while output rank stays bounded',()=>{
  const result=runTinyLayeredAnfAudit();
  assert.equal(result.samples,288);
  assert.equal(result.byLayers.length,6);
  for(const row of result.byLayers){
    assert.equal(row.sources,48);
    assert.ok(row.maximumRank<=row.layers);
    assert.ok(row.maximumDegree>=2);
  }
  assert.ok(result.byLayers[5].maximumDegree>=6);
  assert.ok(result.byLayers[5].maximumRank>=5);
  console.log('LAYERED_TINY_ANF_DEGREE_RANK '+JSON.stringify(result));
});
