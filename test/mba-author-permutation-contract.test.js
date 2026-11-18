'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  polynomialParityConditions,
  xorPolynomial,
  invertXorPolynomial,
  xorShift64,
  xorShiftIsPermutation,
  linearRankOf64,
  xorCyclicShift64,
  linearRank64
} = require('../sims/mba-author-permutation-contract');

test('polynomial-XOR parity contract supports exact low-bit inversion', () => {
  const coefficients = [17n, 29n, 6n, 12n, 4n];
  assert.equal(polynomialParityConditions(coefficients), true);
  const input = 0x8f123456789abcden;
  const target = xorPolynomial(input, coefficients, 64);
  assert.equal(invertXorPolynomial(target, coefficients, 64), input);
});

test('zero-distance xor-shift has the exact diagonal parity criterion', () => {
  assert.equal(xorShiftIsPermutation([7, 19]), true);
  assert.equal(xorShiftIsPermutation([0]), false);
  assert.equal(xorShiftIsPermutation([0, 0, 13]), true);
  assert.equal(linearRankOf64(value => xorShift64(value, [0])), 0);
  assert.equal(linearRankOf64(value => xorShift64(value, [0, 11])), 53);
  assert.equal(linearRankOf64(value => xorShift64(value, [0, 0, 13])), 64);
});

test('cyclic-XOR term-count parity determines 64-bit invertibility', () => {
  assert.equal(linearRank64([3, 20, 29]), 64);
  assert.ok(linearRank64([3, 20]) < 64);
  assert.equal(xorCyclicShift64(0xffffffffffffffffn, [3, 20]), 0n);
});
