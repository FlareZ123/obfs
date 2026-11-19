'use strict';

const assert = require('node:assert/strict');

const WIDTH = 32;
const INVERSE_OF_THREE = 0xaaaaaaab;

/** @param {number} value @returns {number} */
function u32(value) {
  return value >>> 0;
}

/** @param {number} input @returns {number} */
function forward(input) {
  return u32(Math.imul(u32(input), 3));
}

/** @param {number} output @returns {number} */
function inverse(output) {
  return u32(Math.imul(u32(output), INVERSE_OF_THREE));
}

/** @param {number} input @returns {number} */
function affineInterpolant(input) {
  const x = u32(input);
  return u32(x ^ (x << 1));
}

/** @param {number} input @returns {number} */
function residual(input) {
  return u32(forward(input) ^ affineInterpolant(input));
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

/** @returns {{witnessRank:number,witnesses:number,inverseCases:number}} */
function verify() {
  /** @type {number[]} */
  const residualWitnesses = [];
  for (let shift = 0; shift < 30; shift += 1) {
    const input = u32(3 * (2 ** shift));
    const expectedResidual = u32(12 * (2 ** shift));
    assert.equal(residual(input), expectedResidual);
    assert.equal(expectedResidual & 3, 0);
    residualWitnesses.push(expectedResidual);
  }

  const witnessRank = rank32(residualWitnesses);
  assert.equal(witnessRank, 30);

  const edges = [
    0,
    1,
    2,
    3,
    0x7fffffff,
    0x80000000,
    0xffffffff,
    0x12345678,
    0xdeadbeef,
  ];
  for (const input of edges) assert.equal(inverse(forward(input)), u32(input));

  let state = 0x9e3779b9;
  const randomCases = 100000;
  for (let index = 0; index < randomCases; index += 1) {
    state = u32(Math.imul(state, 1664525) + 1013904223);
    assert.equal(inverse(forward(state)), state);
  }

  return {
    witnessRank,
    witnesses: residualWitnesses.length,
    inverseCases: edges.length + randomCases,
  };
}

if (require.main === module) {
  console.log(JSON.stringify({
    width: WIDTH,
    multiplier: 3,
    inverseMultiplier: INVERSE_OF_THREE,
    verification: verify(),
  }, null, 2));
}

module.exports = {
  INVERSE_OF_THREE,
  affineInterpolant,
  forward,
  inverse,
  rank32,
  residual,
  verify,
};
