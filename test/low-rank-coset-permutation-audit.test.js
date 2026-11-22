'use strict';

const assert = require('node:assert/strict');
const {test} = require('node:test');
const {execFileSync} = require('node:child_process');
const path = require('node:path');

test('arbitrary per-coset permutations have a bounded repaired-orbit inverse', () => {
  const script = path.resolve(__dirname, '../sims/low-rank-coset-permutation-audit.js');
  const output = execFileSync(process.execPath, [script], {encoding: 'utf8'});
  const observed = JSON.parse(output);
  assert.equal(observed.seed, '0x41c05e7');
  assert.equal(observed.width, 8);
  assert.equal(observed.summary.length, 4);
  for (let i = 0; i < 4; ++i) {
    const row = observed.summary[i];
    assert.equal(row.r, i + 1);
    assert.equal(row.sources, 128);
    assert.equal(row.targets, 2048);
    assert.equal(row.singularBaseRank, 8 - row.r);
    assert.equal(row.fullResidualRankSources, 128);
    assert.ok(row.maxQueries <= row.theoremBound);
    assert.ok(row.maxSteps <= (1 << Math.min(8, 2 * row.r)));
    assert.equal(Object.values(row.nullities).reduce((a, b) => a + b, 0), 2048);
    assert.ok(Object.entries(row.nullities).some(([d, count]) => Number(d) > 0 && count > 0));
  }
});
