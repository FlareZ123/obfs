'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  profileFiniteDifferenceResidual32,
} = require('../sims/public-finite-difference-residual32.js');

/** @param {number} value @returns {number} */
function u32(value) {
  return value >>> 0;
}

test('frame-free residual screen gives zero on an affine permutation', () => {
  const profile = profileFiniteDifferenceResidual32(
    (input) => u32(input ^ (input << 7) ^ 0x13579bdf),
  );
  assert.equal(profile.basisPairRank, 0);
  assert.equal(profile.observedRank, 0);
  assert.equal(profile.fullRankCertified, false);
  assert.equal(profile.queries, 529);
});

test('basis-pair defects recover every odd-multiply family rank from 30 to 0', () => {
  for (let shift = 1; shift <= 31; shift += 1) {
    const multiplier = u32(1 + (2 ** shift));
    const profile = profileFiniteDifferenceResidual32(
      (input) => u32(Math.imul(input, multiplier)),
    );
    assert.equal(profile.basisPairRank, 31 - shift, 'basis rank shift ' + shift);
    assert.equal(profile.observedRank, 31 - shift, 'observed rank shift ' + shift);
    assert.equal(profile.fullRankCertified, false);
    assert.equal(profile.queries, 529);
  }
});

test('basis-pair defects can certify full residual rank without interpolation', () => {
  const pairs = Array.from({length: 32}, (_, outputBit) => {
    const left = outputBit % 16;
    const right = 16 + Math.floor(outputBit / 16) * 8 + (outputBit % 8);
    return [left, right, outputBit];
  });

  const oracle = (input) => {
    const x = u32(input);
    let output = x;
    for (const [left, right, outputBit] of pairs) {
      if (((x >>> left) & 1) !== 0 && ((x >>> right) & 1) !== 0) {
        output = u32(output ^ (2 ** outputBit));
      }
    }
    return output;
  };

  const profile = profileFiniteDifferenceResidual32(oracle);
  assert.equal(profile.basisPairRank, 32);
  assert.equal(profile.observedRank, 32);
  assert.equal(profile.fullRankCertified, true);
  assert.equal(profile.queries, 529);
});
