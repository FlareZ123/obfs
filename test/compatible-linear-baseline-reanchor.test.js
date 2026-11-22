'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {runEvidence}=require('../sims/compatible-linear-baseline-reanchor');

test('hidden compatible linear baseline permits exact reanchored fixed-point inversion',()=>{
  const result=runEvidence();
  assert.equal(result.sources,6);
  assert.equal(result.rare,6);
  assert.equal(result.ordinary,6);
  assert.equal(result.heldouts,768);
  assert.ok(result.rows.every(row=>row.mismatchedCompositeColumns>0));
  assert.ok(result.rows.every(row=>row.rareQueries<=66&&row.ordinaryQueries<=66));
  console.log('COMPATIBLE_BASELINE_ANCHOR '+JSON.stringify(result));
});
