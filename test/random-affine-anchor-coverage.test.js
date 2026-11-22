'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {runCoverage}=require('../sims/random-affine-anchor-coverage');

test('source-private poisoned-anchor population retains sparse clean-basis coverage',()=>{
  const result=runCoverage();
  assert.equal(result.sources,6);
  assert.equal(result.basesPerSource,4096);
  assert.equal(result.initialDirty,6);
  assert.equal(result.clean+result.dirty,24576);
  assert.ok(result.clean>result.dirty,'Source population must have predominantly clean random bases');
  console.log('SPARSE_ANCHOR_COVERAGE '+JSON.stringify(result));
});
