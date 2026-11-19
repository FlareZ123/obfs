'use strict';

const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

test('independent finite-set audit validates public residual-rank inversion proof at width 3', () => {
  const script = path.join(__dirname, '..', 'sims', 'public-affine-residual-proof-audit-width3.js');
  const report = JSON.parse(execFileSync(process.execPath, [script], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
  }));

  assert.equal(report.width, 3);
  assert.equal(report.permutations, 40320);
  assert.equal(report.targets, 322560);
  assert.equal(report.structuralChecks, 40320);
  assert.equal(report.maxRounds, 3);
  assert.equal(report.maxCandidateInputs, 8);
  assert.deepEqual(report.regimes, {
    '0:0': 10752,
    '1:0': 64512,
    '1:1': 10752,
    '2:0': 118272,
    '2:1': 32256,
    '3:0': 64512,
    '3:1': 21504,
  });
});
