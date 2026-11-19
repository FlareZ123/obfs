'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

test('full-rank low-dimensional displacement cases invert by hidden-coset cycle walking', () => {
  const script = path.join(__dirname, '..', 'sims', 'low-rank-displacement-cycle-inversion.js');
  const report = JSON.parse(execFileSync(process.execPath, [script], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
  }));

  assert.equal(report.generatedCases, 512);
  assert.equal(report.rows.length, 2);
  for (const row of report.rows) {
    assert.ok(row.fullRankCases > 0);
    assert.ok(row.singularCases > 0);
    assert.equal(row.exactRecoveries, row.fullRankCases);
    assert.ok(row.maxObservedQueries <= row.theoremQueryBound);
    assert.ok(row.maxObservedCycleLength <= 2 ** row.nonlinearSubspaceDimension);
  }
});
