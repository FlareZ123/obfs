'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {runEvidence}=require('../sims/random-affine-anchor-compatible-inversion');

test('random affine reanchoring recovers forced rare targets after canonical base poisoning',()=>{
  const evidence=runEvidence();
  assert.equal(evidence.poisonedSources,6);
  assert.equal(evidence.rareRecovered,6);
  assert.equal(evidence.controlRecovered,6);
  assert.equal(evidence.heldouts,384);
  assert.ok(evidence.rows.every(row=>row.canonicalMismatches===32));
  assert.ok(evidence.rows.every(row=>row.rare.queries<=264&&row.control.queries<=264));
  assert.equal(evidence.dense.length,3);
  assert.ok(evidence.dense.every(row=>row.sources===8&&row.exact+row.failures===8));
  console.log('SPARSE_REANCHOR '+JSON.stringify(evidence));
});
