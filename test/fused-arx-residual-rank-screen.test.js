'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  screen,
} = require('../sims/fused-arx-residual-rank-screen');

test('fused ARX residual rank grows to full dimension across a fixed block', () => {
  const one = screen(new Uint16Array([0x1234]));
  const two = screen(new Uint16Array([0x1234, 0x5678]));
  const three = screen(new Uint16Array([0x1234, 0x5678, 0x9abc]));
  const four = screen(new Uint16Array([0x1234, 0x5678, 0x9abc, 0xdef0]));

  assert.equal(one.rank, 62);
  assert.equal(two.rank, 124);
  assert.equal(three.rank, 126);
  assert.equal(four.rank, 128);

  assert.equal(one.checkpoints[64], 62);
  assert.equal(two.checkpoints[128], 124);
  assert.equal(three.checkpoints[128], 126);
  assert.equal(four.checkpoints[128], 128);
});
