'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

test('complete width-3 full-rank cycle model inverts every eligible target', () => {
  const script = path.join(
    __dirname,
    '..',
    'sims',
    'low-rank-displacement-exhaustive-width3.js',
  );
  const report = JSON.parse(execFileSync(process.execPath, [script], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
  }));

  assert.equal(report.permutations, 40320);
  assert.equal(report.fullRank, 32256);
  assert.equal(report.singular, 8064);
  assert.equal(report.recoveredTargets, 258048);
  assert.equal(report.maxCycleLength, 4);
  assert.equal(report.result, 'all full-rank targets recovered exactly');
});
