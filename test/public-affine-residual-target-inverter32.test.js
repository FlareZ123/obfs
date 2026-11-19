'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  invertPublicResidual32,
  invertPublicResidualDeterministic32,
} = require('../sims/public-affine-residual-target-inverter32');

/** @param {number} value @param {number} outputBit @param {number} leftBit @param {number} rightBit @returns {number} */
function shear(value, outputBit, leftBit, rightBit) {
  const predicate = ((value >>> leftBit) & 1) & ((value >>> rightBit) & 1);
  return (value ^ (predicate * (2 ** outputBit))) >>> 0;
}

/** @param {number} input @returns {number} */
function oracle(input) {
  let value = input >>> 0;
  value = shear(value, 0, 4, 5);
  value = shear(value, 8, 12, 13);
  value = shear(value, 16, 20, 21);
  value = shear(value, 24, 28, 29);
  return value >>> 0;
}

test('32-bit public residual inverter recovers targets from four independent nonlinear directions', () => {
  const secrets = [
    0x00000000, 0x00000030, 0x00003000, 0x00300000, 0x30000000,
    0x12345678, 0x89abcdef, 0xffffffff, 0x5a5aa5a5, 0xdeadbeef,
  ];
  for (const secret of secrets) {
    const result = invertPublicResidual32(oracle, oracle(secret), {
      seed: (secret ^ 0x9e3779b9) >>> 0,
      maxQueries: 512,
      maxSubspaceDimension: 8,
    });
    assert.equal(result.value >>> 0, secret >>> 0);
    assert.equal(result.nullity, 0);
    assert.ok(result.queries <= 50, `unexpected query count ${result.queries}`);
    assert.ok(result.expansions <= 4);
  }
});

const low3Permutation = [0, 1, 2, 4, 3, 5, 6, 7];

/** @param {number} input @returns {number} */
function singularOracle(input) {
  return (((input >>> 0) & 0xfffffff8) | low3Permutation[input & 7]) >>> 0;
}

test('32-bit public residual inverter handles singular interpolation with residual rank one', () => {
  const secrets = [0, 1, 2, 3, 4, 5, 6, 7, 0x1234567b, 0xdeadbeef];
  for (const secret of secrets) {
    const result = invertPublicResidual32(singularOracle, singularOracle(secret), {
      seed: (secret ^ 0x6a09e667) >>> 0,
      maxQueries: 128,
      maxSubspaceDimension: 4,
    });
    assert.equal(result.value >>> 0, secret >>> 0);
    assert.equal(result.nullity, 1);
    assert.ok(result.queries <= 40, `unexpected query count ${result.queries}`);
    assert.equal(result.expansions, 0);
  }
});


test('deterministic 32-bit residual inverter recovers four-direction targets without quotient sampling', () => {
  const secrets = [
    0x00000000, 0x00000030, 0x00003000, 0x00300000, 0x30000000,
    0x12345678, 0x89abcdef, 0xffffffff, 0x5a5aa5a5, 0xdeadbeef,
  ];
  for (const secret of secrets) {
    const result = invertPublicResidualDeterministic32(
      oracle,
      oracle(secret),
      {
        maxQueries: 128,
        maxSubspaceDimension: 8,
      },
    );
    assert.equal(result.value >>> 0, secret >>> 0);
    assert.equal(result.nullity, 0);
    assert.ok(result.queries <= 49, `unexpected query count ${result.queries}`);
    assert.equal(result.rankRepairs, 0);
  }
});

test('deterministic 32-bit residual inverter repairs singular interpolation exactly', () => {
  const secrets = [0, 1, 2, 3, 4, 5, 6, 7, 0x1234567b, 0xdeadbeef];
  for (const secret of secrets) {
    const result = invertPublicResidualDeterministic32(
      singularOracle,
      singularOracle(secret),
      {
        maxQueries: 128,
        maxSubspaceDimension: 4,
      },
    );
    assert.equal(result.value >>> 0, secret >>> 0);
    assert.equal(result.nullity, 1);
    assert.ok(result.queries <= 36, `unexpected query count ${result.queries}`);
    assert.ok(result.rankRepairs <= 1);
    assert.equal(result.closureExpansions, 0);
  }
});
