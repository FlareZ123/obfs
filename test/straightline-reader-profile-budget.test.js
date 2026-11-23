'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {run}=require('../sims/straightline-reader-profile');

test('finite private reader stays within the sampled 2.5x hot-call budget',()=>{
  const report=run();
  assert.equal(report.selectedOwnFieldRewrites,1);
  assert.equal(report.strictOverBudgetPairs,0);
  assert.ok(report.ratioOfMedians<=2.5);
  assert.ok(report.maxPairedRatio<=2.5);
});
