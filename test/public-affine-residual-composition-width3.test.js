'use strict';

const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

test('residual-composition bound spans every width-3 permutation against rank representatives', () => {
  const script = path.join(__dirname, '..', 'sims', 'public-affine-residual-composition-width3.js');
  const report = JSON.parse(execFileSync(process.execPath, [script], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
  }));

  assert.equal(report.width, 3);
  assert.equal(report.permutations, 40320);
  assert.deepEqual(report.representativeRanks, [0, 1, 2, 3]);
  assert.equal(report.pairs, 322560);
  assert.equal(report.maxCompositionRank, 3);
});
