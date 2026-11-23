'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  screen,
} = require('../sims/mba-int32-residual-rank-screen');
const {
  exhaustiveResidualRank,
  predictedResidualRank,
} = require('../sims/constant-multiplier-residual-rank');

test('MBA Int32 second differences escape low residual rank by two rounds', () => {
  const one = screen(1);
  const two = screen(2);
  const four = screen(4);

  assert.equal(one.rank, 29);
  assert.equal(two.rank, 32);
  assert.equal(four.rank, 32);

  assert.deepEqual(one.checkpoints, {
    16: 16,
    32: 29,
    48: 29,
    64: 29,
    96: 29,
    128: 29,
  });
  assert.equal(two.checkpoints[32], 32);
  assert.equal(four.checkpoints[32], 32);
});


test('odd constant multiplication residual-rank formula is exhaustive through width 8', () => {
  let checked = 0;
  for (let width = 2; width <= 8; width += 1) {
    for (let multiplier = 1; multiplier < 2 ** width; multiplier += 2) {
      assert.equal(
        exhaustiveResidualRank(width, multiplier),
        predictedResidualRank(width, multiplier),
        `width=${width} multiplier=${multiplier}`,
      );
      checked += 1;
    }
  }
  assert.equal(checked, 254);
});

test('MBA multiplier formula gives exact one-round residual rank 29', () => {
  assert.equal(predictedResidualRank(32, 0x6d2b79f5), 29);
});
