'use strict';

const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

test('maximal interpolation deficiency gives exact low-rank target inversion', () => {
  const script = path.join(__dirname, '..', 'sims', 'low-rank-maximal-deficiency-inversion.js');
  const report = JSON.parse(execFileSync(process.execPath, [script], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
  }));

  assert.equal(report.width, 10);
  assert.equal(report.totalTargets, 36864);
  assert.deepEqual(report.rows, [
    {
      rangeDimension: 1,
      cases: 12,
      targets: 12288,
      theoreticalQueryBound: 13,
      observedMaxQueries: 13,
    },
    {
      rangeDimension: 2,
      cases: 12,
      targets: 12288,
      theoreticalQueryBound: 17,
      observedMaxQueries: 17,
    },
    {
      rangeDimension: 3,
      cases: 12,
      targets: 12288,
      theoreticalQueryBound: 25,
      observedMaxQueries: 25,
    },
  ]);
});
