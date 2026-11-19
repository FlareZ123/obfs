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

test('exhaustive width-3 k=2 low-rank class inverts every target', () => {
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

  assert.equal(report.hiddenSubspaces, 7);
  assert.equal(report.cosetPreservingPermutationModels, 4032);
  assert.equal(report.initiallySingularModels, 576);
  assert.equal(report.targetRecoveries, '32256/32256');
  assert.ok(report.maxObservedDistinctQueries <= report.theoremDistinctQueryBound);
});
