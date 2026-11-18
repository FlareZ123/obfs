'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const {summarizeCpuPairs} = require('../sims/cpu-pair-summary');

test('CPU pair accounting retains exact strict breaches and unresolved zero ticks', () => {
  const result = summarizeCpuPairs([15, 30, 30, 124], [46, 93, 0, 125]);
  assert.deepEqual(result.pairedRatios, [46 / 15, 93 / 30, null, 125 / 124]);
  assert.equal(result.strictOverBudgetPairs, 2);
  assert.equal(result.unresolvedZeroPairs, 1);
  assert.equal(result.maxPairedRatio, 93 / 30);
  assert.equal(result.ratioOfMedians, 93 / 30);
});

test('exact 2.5x is allowed while a larger ratio breaches', () => {
  const result = summarizeCpuPairs([2, 2], [5, 5.000001]);
  assert.equal(result.strictOverBudgetPairs, 1);
  assert.equal(result.unresolvedZeroPairs, 0);
});

test('all-zero samples remain unresolved rather than forcing fake ratios', () => {
  const result = summarizeCpuPairs([0, 0], [0, 0]);
  assert.deepEqual(result.pairedRatios, [null, null]);
  assert.equal(result.unresolvedZeroPairs, 2);
  assert.equal(result.strictOverBudgetPairs, 0);
  assert.equal(result.maxPairedRatio, null);
  assert.equal(result.ratioOfMedians, null);
});

test('zero candidate and nonzero baseline are also unresolved', () => {
  const result = summarizeCpuPairs([2, 3, 4], [0, 3, 5]);
  assert.deepEqual(result.pairedRatios, [null, 1, 1.25]);
  assert.equal(result.unresolvedZeroPairs, 1);
  assert.equal(result.strictOverBudgetPairs, 0);
});

test('reject impossible or malformed CPU inputs', () => {
  for (const [baseline, candidate] of [
    [[], []],
    [[1, 2], [3]],
    [[-1], [2]],
    [[1], [Infinity]],
    [[NaN], [2]]
  ]) {
    assert.throws(() => summarizeCpuPairs(baseline, candidate), /CPU pair samples/);
  }
});
