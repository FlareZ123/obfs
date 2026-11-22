'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {runEvidence}=require('../sims/sparse-triangular-fixedpoint-inversion');

test('clean affine anchors invert four interacting sparse shears on forced rare and ordinary targets',()=>{
  const observed=runEvidence();
  assert.equal(observed.sources,6);
  assert.equal(observed.rareExact,6);
  assert.equal(observed.controlExact,6);
  assert.equal(observed.heldouts,768);
  assert.ok(observed.rows.every(row=>
    row.rareQueries<=66&&row.controlQueries<=66));
  console.log('SPARSE_TRIANGULAR_FIXEDPOINT '+JSON.stringify(observed));
});
