'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

test('independent width-3 rank-one reviewer reproduces the n+3 theorem', () => {
  const script = path.join(
    __dirname,
    '..',
    'sims',
    'compatible-rank-one-shear-exhaustive-width3.js',
  );
  const report = JSON.parse(execFileSync(process.execPath, [script], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
  }));

  assert.equal(report.checkedForms, 301056);
  assert.equal(report.permutationForms, 18816);
  assert.equal(report.invarianceViolations, 0);
  assert.equal(report.recoveredTargets, 150528);
  assert.deepEqual(report.attackRankCounts, {2: 10752, 3: 139776});
  assert.equal(report.maxQueries, 6);
  assert.equal(report.claimedBound, 6);
});
