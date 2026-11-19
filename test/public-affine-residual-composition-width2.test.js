'use strict';

const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

test('public affine residual rank is subadditive under all width-2 function compositions', () => {
  const script = path.join(__dirname, '..', 'sims', 'public-affine-residual-composition-width2.js');
  const report = JSON.parse(execFileSync(process.execPath, [script], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
  }));

  assert.equal(report.width, 2);
  assert.equal(report.functions, 256);
  assert.equal(report.pairs, 65536);
  assert.equal(report.maxCompositionRank, 1);
  assert.ok(report.tightRankBounds > 0);
});
