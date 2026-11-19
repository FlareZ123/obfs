'use strict';

const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

test('target-guided low-rank inverter covers every width-3 permutation and target', () => {
  const script = path.join(__dirname, '..', 'sims', 'low-rank-exhaustive-width3.js');
  const report = JSON.parse(execFileSync(process.execPath, [script], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
  }));

  assert.equal(report.width, 3);
  assert.equal(report.permutations, 40320);
  assert.equal(report.targets, 322560);
  assert.equal(report.maxQueries, 8);
  assert.deepEqual(report.regimes, {
    '0:0': 64,
    '1:0': 2880,
    '1:1': 256,
    '2:0': 46208,
    '2:1': 8448,
    '3:0': 208896,
    '3:1': 55808,
  });
});
