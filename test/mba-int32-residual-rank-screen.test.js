'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  screen,
} = require('../sims/mba-int32-residual-rank-screen');

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
