'use strict';

const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

test('public residual rank is affine-coordinate invariant at width 3', () => {
  const script = path.join(__dirname, '..', 'sims', 'public-affine-residual-invariance-width3.js');
  const report = JSON.parse(execFileSync(process.execPath, [script], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
  }));

  assert.equal(report.width, 3);
  assert.equal(report.permutations, 40320);
  assert.equal(report.originsAudited, 322560);
  assert.equal(report.generatorChecks, 483840);
  assert.deepEqual(report.standardRegimes, {
    '0:0': 1344,
    '1:0': 8064,
    '1:1': 1344,
    '2:0': 14784,
    '2:1': 4032,
    '3:0': 8064,
    '3:1': 2688,
  });
});
