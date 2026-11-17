'use strict';

const assert=require('node:assert/strict');
const {samples}=require('./application-challenge-sco-cold-bootstrap');
const {pairedBudgetBound}=require('./paired-budget-bound');

/**
 * Apply a distribution-free one-sided 95% interval for the median of paired
 * slowdown ratios to the *already pinned chronological observations* from
 * application SCO cold-process run 43807548781. It is intentionally a
 * different estimand from the bootstrap ratio of medians in the sibling file.
 * @returns {Record<string,Record<string,ReturnType<typeof pairedBudgetBound>>>}
 */
function analyzePinnedSamples(){
  /** @type {Record<string,Record<string,ReturnType<typeof pairedBudgetBound>>>} */
  const report={};
  for(const [platform,cases] of Object.entries(samples)){
    report[platform]={};
    for(const [label,sample] of Object.entries(cases)){
      report[platform][label]=pairedBudgetBound(sample.native,sample.remote);
    }
  }
  assert.equal(report.linux.heavy.samplePairs,9);
  assert.equal(report.linux.heavy.upperRank,8);
  assert.equal(report.linux.heavy.decision,'supported');
  // Borderline: this strict inequality has negligible measurement margin.
  assert.ok(report.linux.heavy.upperMedianBound>2.49);
  assert.ok(report.linux.heavy.upperMedianBound<2.5);
  assert.equal(report.win32.heavy.decision,'supported');
  assert.equal(report.linux.light.decision,'exceeded');
  assert.equal(report.win32.light.decision,'exceeded');
  return report;
}

/** @returns {void} */
function main(){
  const report=analyzePinnedSamples();
  process.stdout.write('APPLICATION_SCO_PINNED_PAIRED_MEDIAN '+
    JSON.stringify({
      originalRun:43807548781,
      method:'exact binomial rank interval for population median of paired ratios',
      caveat:'Independent identically distributed paired timings are assumed; this is not a bound on every execution or on the ratio of population medians',
      report
    })+'\n');
}

if(require.main===module)main();
module.exports={analyzePinnedSamples};
