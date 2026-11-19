'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  INVERSE_OF_THREE,
  affineInterpolant,
  forward,
  inverse,
  residual,
  verify,
} = require('../sims/high-residual-trivial-inverse32.js');

test('32-bit odd multiplication has residual rank 30 but one-step public inverse', () => {
  const report = verify();
  assert.equal(report.witnessRank, 30);
  assert.equal(report.witnesses, 30);
  assert.equal(report.inverseCases, 100009);
  assert.equal(INVERSE_OF_THREE, 0xaaaaaaab);
  assert.equal(Math.imul(3, INVERSE_OF_THREE) >>> 0, 1);

  for (const input of [0, 1, 3, 0x12345678, 0xffffffff]) {
    assert.equal(inverse(forward(input)), input >>> 0);
    assert.equal(residual(input) & 3, 0);
    assert.equal(
      affineInterpolant(input),
      ((input >>> 0) ^ ((input >>> 0) << 1)) >>> 0,
    );
  }
});
