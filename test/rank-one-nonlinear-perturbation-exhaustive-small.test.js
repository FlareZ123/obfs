'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

test('complete width-3 rank-one perturbation model satisfies the n+3 inversion bound', () => {
  const script = path.join(
    __dirname,
    '..',
    'sims',
    'rank-one-nonlinear-perturbation-exhaustive-small.js',
  );
  const report = JSON.parse(execFileSync(process.execPath, [script], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
  }));

  assert.equal(report.invertibleLinearMaps, 168);
  assert.equal(report.nonzeroOutputDirections, 7);
  assert.equal(report.booleanTruthTablesPerRepresentation, 256);
  assert.equal(report.permutationRepresentations, 18816);
  assert.equal(report.totalExactRecoveries, 150528);
  assert.equal(report.maxQueries, 6);
  assert.equal(report.theoremBound, 6);
  assert.equal(report.result, 'all exact');
});
