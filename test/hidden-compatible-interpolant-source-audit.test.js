'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {runEvidence}=require('../sims/hidden-compatible-interpolant-source-audit');

test('source-known compatible basis criterion predicts verified sparse and dense inversion',()=>{
  const result=runEvidence();
  assert.equal(result.sparseSources,6);
  assert.equal(result.denseSources,24);
  assert.equal(result.audits,108);
  assert.equal(result.compatible+result.rankDeficient+result.incompatible,108);
  assert.equal(result.admissibleFailures,0);
  assert.ok(result.admissibleExact>=6);
  assert.ok(result.rows.every(row=>row.queries<=65));
  console.log('HIDDEN_COMPATIBLE_AUDIT '+JSON.stringify(result));
});
