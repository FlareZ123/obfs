'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  multiplierForShift,
  oddInverse32,
  verifyFamily,
} = require('../sims/trivial-inverse-residual-rank-family32.js');

test('trivial odd-multiply inverses realize every residual rank from 0 through 30', () => {
  const report = verifyFamily();
  assert.equal(report.cases, 31);
  assert.deepEqual(
    report.records.map((record) => record.expectedRank),
    Array.from({length: 31}, (_, index) => 30 - index),
  );
  for (const record of report.records) {
    assert.equal(record.witnessRank, record.expectedRank);
    assert.equal(
      Math.imul(record.multiplier, record.inverseMultiplier) >>> 0,
      1,
    );
  }
  assert.equal(multiplierForShift(1), 3);
  assert.equal(oddInverse32(3), 0xaaaaaaab);
});
