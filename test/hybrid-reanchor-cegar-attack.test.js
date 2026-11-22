'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {runEvidence}=require('../sims/hybrid-reanchor-cegar-attack');

test('verified hybrid inversions cover forced sparse and dense compatible populations',()=>{
  const report=runEvidence();
  assert.equal(report.total,30);
  assert.equal(report.exact,30);
  assert.equal(report.poisoned,6);
  assert.equal(report.dense,24);
  assert.equal(report.selectedRare,6);
  assert.ok(report.queriesMin>0&&report.queriesMax>0);
  assert.ok(report.rows.every(row=>row.queries>0));
  console.log('HYBRID_REANCHOR_CEGAR '+JSON.stringify(report));
});
