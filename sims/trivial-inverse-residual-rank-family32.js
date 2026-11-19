'use strict';

const assert = require('node:assert/strict');

const WIDTH = 32;

/** @param {number} value @returns {number} */
function u32(value) {
  return value >>> 0;
}

/** @param {number} value @returns {number} */
function oddInverse32(value) {
  const odd = u32(value);
  assert.equal(odd & 1, 1);
  let inverse = odd;
  for (let iteration = 0; iteration < 5; iteration += 1) {
    inverse = u32(Math.imul(inverse, 2 - Math.imul(odd, inverse)));
  }
  assert.equal(u32(Math.imul(odd, inverse)), 1);
  return inverse;
}

/** @param {number} shift @returns {number} */
function multiplierForShift(shift) {
  assert.ok(shift >= 1 && shift <= 31);
  return u32(1 + (2 ** shift));
}

/** @param {number} input @param {number} shift @returns {number} */
function forwardShift(input, shift) {
  return u32(Math.imul(u32(input), multiplierForShift(shift)));
}

/** @param {number} input @param {number} shift @returns {number} */
function affineShift(input, shift) {
  const x = u32(input);
  return u32(x ^ (x << shift));
}

/** @param {number} input @param {number} shift @returns {number} */
function residualShift(input, shift) {
  return u32(forwardShift(input, shift) ^ affineShift(input, shift));
}

/** @param {number[]} vectors @returns {number} */
function rank32(vectors) {
  const pivots = Array(WIDTH).fill(0);
  let rank = 0;
  for (const original of vectors) {
    let value = u32(original);
    for (let bit = WIDTH - 1; bit >= 0 && value !== 0; bit -= 1) {
      if (((value >>> bit) & 1) === 0) continue;
      if (pivots[bit] !== 0) {
        value = u32(value ^ pivots[bit]);
      } else {
        pivots[bit] = value;
        rank += 1;
        break;
      }
    }
  }
  return rank;
}

/**
 * @param {number} shift
 * @returns {{shift:number,multiplier:number,inverseMultiplier:number,expectedRank:number,witnessRank:number}}
 */
function verifyShift(shift) {
  const multiplier = multiplierForShift(shift);
  const inverseMultiplier = oddInverse32(multiplier);
  const expectedRank = WIDTH - shift - 1;
  /** @type {number[]} */
  const witnesses = [];

  for (let index = 0; index < expectedRank; index += 1) {
    const input = u32(multiplier * (2 ** index));
    const observed = residualShift(input, shift);
    const expected = shift === 1
      ? u32(12 * (2 ** index))
      : u32(2 ** (index + shift + 1));
    assert.equal(observed, expected);
    witnesses.push(observed);
  }
  assert.equal(rank32(witnesses), expectedRank);

  let state = u32(0x9e3779b9 ^ shift);
  for (let sample = 0; sample < 2000; sample += 1) {
    state = u32(Math.imul(state, 1664525) + 1013904223);
    const output = forwardShift(state, shift);
    assert.equal(u32(Math.imul(output, inverseMultiplier)), state);
    const lowMask = shift === 31 ? 0xffffffff : u32((2 ** (shift + 1)) - 1);
    assert.equal(residualShift(state, shift) & lowMask, 0);
  }

  return {shift, multiplier, inverseMultiplier, expectedRank, witnessRank: witnesses.length};
}

/** @returns {{cases:number,records:Array<ReturnType<typeof verifyShift>>}} */
function verifyFamily() {
  const records = [];
  for (let shift = 1; shift <= 31; shift += 1) records.push(verifyShift(shift));
  return {cases: records.length, records};
}

if (require.main === module) {
  console.log(JSON.stringify({width: WIDTH, ...verifyFamily()}, null, 2));
}

module.exports = {
  affineShift,
  forwardShift,
  multiplierForShift,
  oddInverse32,
  rank32,
  residualShift,
  verifyFamily,
  verifyShift,
};
