'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

test('two-sided affine-wrapped rank-one compatible shears invert within n+3 chosen queries', () => {
  const script = path.join(
    __dirname,
    '..',
    'sims',
    'compatible-rank-one-shear-two-sided-inversion.js',
  );
  const report = JSON.parse(execFileSync(process.execPath, [script], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
  }));

  assert.equal(report.result, 'all 256 published targets inverted exactly');
  assert.equal(report.generalQueryBound, 'n + 3');
  assert.equal(report.width32QueryBound, 35);
  assert.ok(report.observedMaxQueries <= 35);
  assert.equal(report.rows.length, 2);
  assert.deepEqual(
    report.rows.map((row) => row.cases),
    [128, 128],
  );
});
