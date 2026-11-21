'use strict';

const assert = require('node:assert/strict');
const {test} = require('node:test');
const {run} = require('../sims/public-residual-width5-6-independent');

test('independent fixed-seed rank-repair inverter audits all width-5/6 permutation targets',()=>{
  const result=run(true);
  assert.equal(result.seed,'0x8a11d065');
  assert.equal(result.cases,400);
  assert.equal(result.targets,17920);
  assert.equal(result.initiallySingular,150);
  assert.ok(result.maxRepairs>=2);
  assert.ok(result.maxExpansions>=3);
  assert.ok(result.maxQueries<=64);
});
