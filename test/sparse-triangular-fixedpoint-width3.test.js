'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {runWidth3}=require('../sims/sparse-triangular-fixedpoint-width3-peer');

test('independent width-three enumeration confirms conditional fixed-point inversion bound',()=>{
  const observed=runWidth3();
  assert.equal(observed.permutations,128);
  assert.equal(observed.innerLinearMaps,168);
  assert.equal(observed.outerMaps,2);
  assert.equal(observed.inputOffsets,2);
  assert.ok(observed.cleanConfigurations>0);
  assert.ok(observed.dirtyConfigurations>0);
  assert.ok(observed.nontrivialCleanConfigurations>0);
  assert.ok(observed.exactRecoveries>1000);
  assert.ok(observed.maxQueries<=8);
  assert.ok(observed.maxCorrections<=3);
  console.log('SPARSE_TRIANGULAR_WIDTH3 '+JSON.stringify(observed));
});
