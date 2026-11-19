'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

test('sparse two-sided sandwich witness leaves one hidden pair after 2^(n-1)-1 inputs', () => {
  const script = path.join(__dirname, '..', 'sims', 'two-sided-sparse-certification-lower-bound.js');
  const report = JSON.parse(execFileSync(process.execPath, [script], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
  }));

  assert.equal(report.width, 8);
  assert.equal(report.candidateHiddenPairs, 128);
  assert.equal(report.oracleInputsInTranscript, 127);
  assert.equal(report.everyCandidateDiffersFromBaselineOnExactly, 2);
  assert.equal(report.scalarAffineDefectSupport, 2);
  assert.equal(report.transcriptIndistinguishableFromOneUnqueriedSparseCandidate, true);
});
