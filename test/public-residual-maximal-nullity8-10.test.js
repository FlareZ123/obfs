'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {run}=require('../sims/public-residual-maximal-nullity8-10');

test('full-target width-8/10 equal-rank/nullity inversion repairs up to five missing dimensions',()=>{
  const result=run();
  assert.equal(result.seed,'0xa811d065');
  assert.equal(result.instances,32);
  assert.equal(result.targets,14336);
  assert.equal(result.highNullity,5);
  assert.equal(result.maxRepairs,5);
  assert.equal(result.maxExpansions,5);
  assert.equal(result.maxQueries,51);
  assert.equal(result.attempts,119);
  assert.deepEqual(result.byWidth,{'8':6144,'10':8192});
});
