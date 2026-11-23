'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {runCrosswrappedActiveTriangularAttack,runAffineHeavyTriangularAttack}=
  require('../sims/triangular-active-crosswrapped-inversion');

test('independently wrapped 32-bit triangular active coordinates remain low-rank target-invertible',()=>{
  const result=runCrosswrappedActiveTriangularAttack();
  assert.equal(result.sources,48);
  assert.equal(result.targets,144);
  assert.equal(result.exactInversions,144);
  assert.equal(result.sampledRankViolations,0);
  assert.equal(result.upperBoundViolations,0);
  assert.equal(result.byK.length,4);
  for(const row of result.byK){
    assert.equal(row.sources,12);
    assert.equal(row.targets,36);
    assert.ok(row.maxCalls<=33+2**(2*row.k));
  }
  console.log('CROSSWRAPPED_TRIANGULAR_ACTIVE_INVERSION '+JSON.stringify(result));
});

test('32 active triangular gates with only t nonlinear controls retain rank-t inversion',()=>{
  const result=runAffineHeavyTriangularAttack();
  assert.equal(result.sources,48);
  assert.equal(result.targets,144);
  assert.equal(result.exactInversions,144);
  assert.equal(result.exactSampleRanks,48);
  assert.ok(result.maxNullity<=4);
  for(const row of result.byNonlinear){
    assert.equal(row.sources,12);
    assert.equal(row.targets,36);
    assert.ok(row.maxCalls<=33+2**(2*row.nonlinearCount));
  }
  console.log('AFFINE_HEAVY_TRIANGULAR_INVERSION '+JSON.stringify(result));
});
