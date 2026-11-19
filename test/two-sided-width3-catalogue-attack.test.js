'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

test('complete width-3 two-sided catalogue is target-invertible within five chosen queries', () => {
  const script = path.join(__dirname, '..', 'sims', 'two-sided-width3-catalogue-attack.js');
  const report = JSON.parse(execFileSync(process.execPath, [script], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
  }));

  assert.equal(report.compatiblePermutations, 128);
  assert.equal(report.invertibleLinearMaps, 168);
  assert.equal(report.distinctTwoSidedPermutations, 10752);
  assert.equal(report.initialTranscriptClasses, 1680);
  assert.equal(report.maxFunctionsPerInitialTranscript, 7);
  assert.equal(report.maximumChosenQueriesPerTarget, 5);
  assert.equal(report.targetsChecked, 8);
});
