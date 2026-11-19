'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

test('empirical rank repair recovers every generated singular low-rank case', () => {
  const script = path.join(
    __dirname,
    '..',
    'sims',
    'low-rank-displacement-singular-repair.js',
  );
  const report = JSON.parse(execFileSync(process.execPath, [script], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
  }));

  assert.equal(report.generatedCases, 512);
  assert.equal(report.exactRecoveries, 512);
  assert.equal(report.rows.length, 2);
  for (const row of report.rows) {
    assert.equal(row.recovered, 256);
    assert.equal(row.unresolved, 0);
  }
});
