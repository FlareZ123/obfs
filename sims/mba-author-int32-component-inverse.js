'use strict';

const assert = require('node:assert/strict');

const WIDTH = 32;
const MASK_BIGINT = 0xffffffffn;

/**
 * @typedef {object} Int32PermutationRound
 * @property {number[]} coefficients Polynomial-XOR coefficients, low degree first.
 * @property {number[]} xorShifts Logical right-shift distances in 1..31.
 * @property {number[]} cyclicShifts Rotate-left distances in 1..31.
 */

/** @param {number} value @returns {number} */
function u32(value) {
  return value >>> 0;
}

/**
 * Evaluate the author-style XOR-of-monomials polynomial modulo 2^32 using
 * Math.imul for exact low-32-bit multiplication.
 * @param {number} input
 * @param {number[]} coefficients
 * @returns {number}
 */
function polynomialPermutation32(input, coefficients) {
  const x = u32(input);
  let result = u32(coefficients[0]);
  let power = 1;
  for (let degree = 1; degree < coefficients.length; degree++) {
    power = u32(Math.imul(power, x));
    result = u32(result ^ Math.imul(u32(coefficients[degree]), power));
  }
  return result;
}

/**
 * Recover a preimage from a valid compatible polynomial-XOR permutation by
 * lifting one low input bit at a time.
 * @param {number} target
 * @param {number[]} coefficients
 * @returns {number}
 */
function invertPolynomialPermutation32(target, coefficients) {
  const wanted = u32(target);
  let x = 0;
  for (let bit = 0; bit < WIDTH; bit++) {
    const bitValue = 2 ** bit;
    const mask = bit === WIDTH - 1 ? 0xffffffff : u32((2 ** (bit + 1)) - 1);
    const candidate = u32(x + bitValue);
    const zeroMatches = u32(polynomialPermutation32(x, coefficients) & mask) ===
      u32(wanted & mask);
    const oneMatches = u32(polynomialPermutation32(candidate, coefficients) & mask) ===
      u32(wanted & mask);
    if (zeroMatches === oneMatches) {
      throw new Error('polynomial layer is not a triangular permutation for the supplied coefficients');
    }
    if (oneMatches) x = candidate;
  }
  return u32(x);
}

/**
 * @param {number} input
 * @param {number[]} shifts
 * @returns {number}
 */
function xorShiftPermutation32(input, shifts) {
  const x = u32(input);
  let result = x;
  for (const shift of shifts) result ^= x >>> shift;
  return u32(result);
}

/**
 * @param {number} target
 * @param {number[]} shifts
 * @returns {number}
 */
function invertXorShiftPermutation32(target, shifts) {
  const wanted = u32(target);
  let x = 0;
  for (let bit = WIDTH - 1; bit >= 0; bit--) {
    let value = (wanted >>> bit) & 1;
    for (const shift of shifts) {
      const sourceBit = bit + shift;
      if (sourceBit < WIDTH) value ^= (x >>> sourceBit) & 1;
    }
    if (value !== 0) x = u32(x | (1 << bit));
  }
  return u32(x);
}

/** @param {number} input @param {number} shift @returns {number} */
function rotateLeft32(input, shift) {
  const x = u32(input);
  const amount = shift % WIDTH;
  if (amount === 0) return x;
  return u32((x << amount) | (x >>> (WIDTH - amount)));
}

/**
 * @param {number} input
 * @param {number[]} shifts
 * @returns {number}
 */
function cyclicXorPermutation32(input, shifts) {
  let result = 0;
  for (const shift of shifts) result ^= rotateLeft32(input, shift);
  return u32(result);
}

/**
 * Invert the public 32x32 GF(2) map induced by XORed rotations.
 * @param {number} target
 * @param {number[]} shifts
 * @returns {number}
 */
function invertCyclicXorPermutation32(target, shifts) {
  /** @type {{coefficients:bigint,rhs:bigint}[]} */
  const rows = [];
  const wanted = BigInt(u32(target));
  for (let outputBit = 0; outputBit < WIDTH; outputBit++) {
    let coefficients = 0n;
    for (const shift of shifts) {
      const inputBit = (outputBit - (shift % WIDTH) + WIDTH) % WIDTH;
      coefficients ^= 1n << BigInt(inputBit);
    }
    rows.push({
      coefficients,
      rhs: (wanted >> BigInt(outputBit)) & 1n
    });
  }

  let pivotRow = 0;
  for (let column = 0; column < WIDTH; column++) {
    let pivot = -1;
    for (let row = pivotRow; row < WIDTH; row++) {
      if (((rows[row].coefficients >> BigInt(column)) & 1n) === 1n) {
        pivot = row;
        break;
      }
    }
    if (pivot < 0) throw new Error('cyclic-XOR layer is singular for the supplied shifts');
    [rows[pivotRow], rows[pivot]] = [rows[pivot], rows[pivotRow]];
    for (let row = 0; row < WIDTH; row++) {
      if (row !== pivotRow &&
          ((rows[row].coefficients >> BigInt(column)) & 1n) === 1n) {
        rows[row].coefficients ^= rows[pivotRow].coefficients;
        rows[row].rhs ^= rows[pivotRow].rhs;
      }
    }
    pivotRow++;
  }

  let x = 0n;
  for (let bit = 0; bit < WIDTH; bit++) x |= rows[bit].rhs << BigInt(bit);
  return Number(x & MASK_BIGINT) >>> 0;
}

/** @param {number} input @param {Int32PermutationRound} round @returns {number} */
function forwardRound32(input, round) {
  let value = polynomialPermutation32(input, round.coefficients);
  value = xorShiftPermutation32(value, round.xorShifts);
  return cyclicXorPermutation32(value, round.cyclicShifts);
}

/** @param {number} target @param {Int32PermutationRound} round @returns {number} */
function inverseRound32(target, round) {
  let value = invertCyclicXorPermutation32(target, round.cyclicShifts);
  value = invertXorShiftPermutation32(value, round.xorShifts);
  return invertPolynomialPermutation32(value, round.coefficients);
}

/** @param {number} input @param {Int32PermutationRound[]} rounds @returns {number} */
function forwardChain32(input, rounds) {
  let value = u32(input);
  for (const round of rounds) value = forwardRound32(value, round);
  return value;
}

/** @param {number} target @param {Int32PermutationRound[]} rounds @returns {number} */
function inverseChain32(target, rounds) {
  let value = u32(target);
  for (let index = rounds.length - 1; index >= 0; index--) {
    value = inverseRound32(value, rounds[index]);
  }
  return value;
}

function selfTest() {
  const round = {
    coefficients: [0x91e10da5, 0x6d2b79f5],
    xorShifts: [7, 19],
    cyclicShifts: [3, 11, 23]
  };
  const rounds = Array.from({length: 6}, () => round);
  const inputs = [
    0, 1, 47, 0x7fffffff, 0x80000000, 0xffffffff, 0x12345678, 0xdeadbeef
  ];
  for (const input of inputs) {
    const target = forwardChain32(input, rounds);
    assert.equal(inverseChain32(target, rounds), u32(input));
  }
  console.log(JSON.stringify({
    width: WIDTH,
    rounds: rounds.length,
    exactRecoveries: inputs.length
  }, null, 2));
}

if (require.main === module) selfTest();

module.exports = {
  u32,
  polynomialPermutation32,
  invertPolynomialPermutation32,
  xorShiftPermutation32,
  invertXorShiftPermutation32,
  rotateLeft32,
  cyclicXorPermutation32,
  invertCyclicXorPermutation32,
  forwardRound32,
  inverseRound32,
  forwardChain32,
  inverseChain32
};
