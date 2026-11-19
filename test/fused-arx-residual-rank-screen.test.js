'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  screen,
} = require('../sims/fused-arx-residual-rank-screen');

test('one-unit fused ARX transition has exact residual rank 62', () => {
  const result = screen();
  assert.equal(result.rank, 62);
  assert.deepEqual(result.checkpoints, {
    32: 32,
    64: 62,
    96: 62,
    128: 62,
    160: 62,
    192: 62,
    224: 62,
    256: 62,
  });
});
