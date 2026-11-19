'use strict';

const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

test('target-guided subspace growth exactly inverts all low-rank deficiency regimes', () => {
  const script = path.join(__dirname, '..', 'sims', 'low-rank-target-guided-subspace-growth.js');
  const report = JSON.parse(execFileSync(process.execPath, [script], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
  }));

  assert.equal(report.width, 10);
  assert.equal(report.totalTargets, 86016);
  assert.equal(report.rows.length, 14);
  for (const row of report.rows) {
    assert.equal(row.cases, 6);
    assert.equal(row.targets, 6144);
    assert.ok(row.nullity >= 0 && row.nullity <= row.rangeDimension);
    assert.equal(row.expectedSearchBound, 1 << row.nullity);
    assert.equal(
      row.expectedTotalQueryBound,
      11 + (1 << row.nullity) + (1 << row.rangeDimension),
    );
    assert.ok(row.maxSubspaceExpansions <= row.rangeDimension - row.nullity);
  }
});
