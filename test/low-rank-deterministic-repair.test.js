'use strict';

const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

test('deterministic low-rank repair handles singular 32-bit generated cases', () => {
  const script = path.join(
    __dirname,
    '..',
    'sims',
    'low-rank-deterministic-repair.js',
  );
  const report = JSON.parse(execFileSync(process.execPath, [script], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
  }));

  assert.equal(report.total, 768);
  assert.equal(report.exact, 768);
  assert.ok(report.singular > 0);
  assert.deepEqual(report.rows.map((row) => row.k), [2, 4, 8]);

  for (const row of report.rows) {
    assert.equal(row.exactRecoveries, row.generated);
    assert.ok(row.initiallySingular > 0);
    assert.ok(row.maxQueries <= row.theoremQueryBound);
    assert.ok(row.maxClosureDimension <= row.k);
    assert.ok(row.maxCycleLength <= 2 ** row.k);
  }
});

test('exhaustive width-3 public residual theorem inverts every permutation target', () => {
  const script = path.join(
    __dirname,
    '..',
    'sims',
    'low-rank-deterministic-repair-exhaustive-width3.js',
  );
  const report = JSON.parse(execFileSync(process.execPath, [script], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
  }));

  assert.equal(report.permutations, 40320);
  assert.equal(report.initiallySingularModels, 8064);
  assert.equal(report.secondDifferenceChecks, 40320);
  assert.equal(report.inverseResidualChecks, 40320);
  assert.equal(report.targetRecoveries, '322560/322560');
  assert.ok(report.maxObservedDistinctQueries <= 8);
});
