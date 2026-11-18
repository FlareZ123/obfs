'use strict';

const assert = require('node:assert/strict');

const WIDTH = 64;
const MASK64 = (1n << 64n) - 1n;

/** @param {number} width @returns {bigint} */
function maskFor(width) {
  return (1n << BigInt(width)) - 1n;
}

/** @param {bigint[]} coefficients @returns {boolean} */
function polynomialParityConditions(coefficients) {
  if (coefficients.length < 2 || (coefficients[1] & 1n) === 0n) return false;
  let evenParity = 0n;
  for (let i = 2; i < coefficients.length; i += 2) evenParity ^= coefficients[i] & 1n;
  if (evenParity !== 0n) return false;
  let oddParity = 0n;
  for (let i = 3; i < coefficients.length; i += 2) oddParity ^= coefficients[i] & 1n;
  return oddParity === 0n;
}

/**
 * Evaluate the author generator's XOR-of-monomials polynomial modulo 2^width.
 * @param {bigint} input
 * @param {bigint[]} coefficients
 * @param {number} width
 * @returns {bigint}
 */
function xorPolynomial(input, coefficients, width) {
  const mask = maskFor(width);
  const x = input & mask;
  let result = coefficients[0] & mask;
  let power = 1n;
  for (let i = 1; i < coefficients.length; i += 1) {
    power = (power * x) & mask;
    result ^= (coefficients[i] * power) & mask;
  }
  return result & mask;
}

/** @param {bigint[]} coefficients @param {number} width @returns {boolean} */
function isXorPolynomialPermutation(coefficients, width) {
  const size = 2 ** width;
  const seen = new Set();
  for (let input = 0; input < size; input += 1) {
    seen.add(xorPolynomial(BigInt(input), coefficients, width).toString());
  }
  return seen.size === size;
}

/** @returns {{families:number,permutations:number,mismatches:number}} */
function exhaustPolynomialCriterion() {
  const configs = [
    { width: 2, degree: 4 },
    { width: 3, degree: 4 },
    { width: 4, degree: 3 }
  ];
  let families = 0;
  let permutations = 0;
  let mismatches = 0;
  for (const { width, degree } of configs) {
    const modulus = 2 ** width;
    const count = degree + 1;
    const total = modulus ** count;
    for (let encoded = 0; encoded < total; encoded += 1) {
      let cursor = encoded;
      /** @type {bigint[]} */
      const coefficients = [];
      for (let i = 0; i < count; i += 1) {
        coefficients.push(BigInt(cursor % modulus));
        cursor = Math.floor(cursor / modulus);
      }
      const predicted = polynomialParityConditions(coefficients);
      const actual = isXorPolynomialPermutation(coefficients, width);
      if (actual) permutations += 1;
      if (predicted !== actual) mismatches += 1;
      families += 1;
    }
  }
  assert.equal(mismatches, 0);
  return { families, permutations, mismatches };
}

/**
 * @param {bigint} target
 * @param {bigint[]} coefficients
 * @param {number} width
 * @returns {bigint}
 */
function invertXorPolynomial(target, coefficients, width) {
  if (!polynomialParityConditions(coefficients)) {
    throw new Error('invalid polynomial-XOR permutation coefficients');
  }
  let prefix = 0n;
  for (let bit = 0; bit < width; bit += 1) {
    const candidateBit = 1n << BigInt(bit);
    const prefixMask = (candidateBit << 1n) - 1n;
    const wanted = target & prefixMask;
    const low = xorPolynomial(prefix, coefficients, bit + 1);
    const high = xorPolynomial(prefix | candidateBit, coefficients, bit + 1);
    const lowMatches = low === wanted;
    const highMatches = high === wanted;
    if (lowMatches === highMatches) throw new Error('polynomial-XOR bit lift is not unique');
    if (highMatches) prefix |= candidateBit;
  }
  return prefix;
}

/** @param {number} seed @returns {()=>number} */
function makeRng(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
}

/** @param {()=>number} next @returns {bigint} */
function randomWord64(next) {
  return (BigInt(next()) << 32n) | BigInt(next());
}

/** @param {()=>number} next @param {number} degree @returns {bigint[]} */
function randomValidCoefficients(next, degree) {
  const coefficients = Array.from({ length: degree + 1 }, () => randomWord64(next));
  coefficients[1] |= 1n;
  let evenParity = 0n;
  for (let i = 2; i <= degree; i += 2) evenParity ^= coefficients[i] & 1n;
  if (evenParity !== 0n) coefficients[2] ^= 1n;
  if (degree >= 3) {
    let oddParity = 0n;
    for (let i = 3; i <= degree; i += 2) oddParity ^= coefficients[i] & 1n;
    if (oddParity !== 0n) coefficients[3] ^= 1n;
  }
  assert.equal(polynomialParityConditions(coefficients), true);
  return coefficients;
}

/** @returns {{cases:number,exactRecoveries:number}} */
function runPolynomial64BitLifts() {
  let cases = 0;
  let exactRecoveries = 0;
  for (let degree = 1; degree <= 6; degree += 1) {
    for (let sample = 0; sample < 32; sample += 1) {
      const next = makeRng((0x243f6a88 ^ (degree * 0x9e37) ^ sample) >>> 0);
      const coefficients = randomValidCoefficients(next, degree);
      const input = randomWord64(next);
      const target = xorPolynomial(input, coefficients, WIDTH);
      assert.equal(invertXorPolynomial(target, coefficients, WIDTH), input);
      exactRecoveries += 1;
      cases += 1;
    }
  }
  return { cases, exactRecoveries };
}

/** @param {bigint} value @param {number[]} shifts @returns {bigint} */
function xorShift64(value, shifts) {
  const x = value & MASK64;
  let result = x;
  for (const shift of shifts) result ^= x >> BigInt(shift);
  return result & MASK64;
}

/** @param {number[]} shifts @returns {boolean} */
function xorShiftIsPermutation(shifts) {
  let zeroCount = 0;
  for (const shift of shifts) if (shift === 0) zeroCount += 1;
  return (zeroCount & 1) === 0;
}

/** @param {(value:bigint)=>bigint} transform @returns {number} */
function linearRankOf64(transform) {
  /** @type {bigint[]} */
  const pivots = Array(WIDTH).fill(0n);
  let rank = 0;
  for (let column = 0; column < WIDTH; column += 1) {
    let vector = transform(1n << BigInt(column));
    for (let bit = WIDTH - 1; bit >= 0 && vector !== 0n; bit -= 1) {
      const bitMask = 1n << BigInt(bit);
      if ((vector & bitMask) === 0n) continue;
      if (pivots[bit] !== 0n) vector ^= pivots[bit];
      else {
        pivots[bit] = vector;
        rank += 1;
        break;
      }
    }
  }
  return rank;
}

/** @returns {{cases:number,permutationCases:number,singularCases:number,zeroCancellationRank:number}} */
function runXorShiftZeroAudit() {
  let cases = 0;
  let permutationCases = 0;
  let singularCases = 0;
  for (let operands = 2; operands <= 5; operands += 1) {
    for (let sample = 0; sample < 128; sample += 1) {
      const next = makeRng((0x85ebca6b ^ (operands * 0x10001) ^ sample) >>> 0);
      const shifts = Array.from({ length: operands - 1 }, () => next() % 64);
      const rank = linearRankOf64(value => xorShift64(value, shifts));
      const predicted = xorShiftIsPermutation(shifts);
      assert.equal(rank === WIDTH, predicted);
      if (predicted) permutationCases += 1;
      else singularCases += 1;
      cases += 1;
    }
  }
  const zeroCancellationRank = linearRankOf64(value => xorShift64(value, [0]));
  assert.equal(zeroCancellationRank, 0);
  return { cases, permutationCases, singularCases, zeroCancellationRank };
}

/** @param {bigint} value @param {number} shift @returns {bigint} */
function rotateLeft64(value, shift) {
  const amount = BigInt(shift % WIDTH);
  const x = value & MASK64;
  if (amount === 0n) return x;
  return ((x << amount) | (x >> (64n - amount))) & MASK64;
}

/** @param {bigint} value @param {number[]} shifts @returns {bigint} */
function xorCyclicShift64(value, shifts) {
  let result = 0n;
  for (const shift of shifts) result ^= rotateLeft64(value, shift);
  return result & MASK64;
}

/** @param {number[]} shifts @returns {number} */
function linearRank64(shifts) {
  return linearRankOf64(value => xorCyclicShift64(value, shifts));
}

/** @returns {{cases:number,oddCases:number,evenCases:number,minEvenRank:number,maxEvenRank:number}} */
function runCyclicParityAudit() {
  let cases = 0;
  let oddCases = 0;
  let evenCases = 0;
  let minEvenRank = WIDTH;
  let maxEvenRank = 0;
  for (let count = 1; count <= 8; count += 1) {
    for (let sample = 0; sample < 64; sample += 1) {
      const next = makeRng((0x9e3779b9 ^ (count * 0x10001) ^ sample) >>> 0);
      const shifts = Array.from({ length: count }, () => 1 + (next() % 63));
      const rank = linearRank64(shifts);
      if ((count & 1) === 1) {
        oddCases += 1;
        assert.equal(rank, WIDTH);
      } else {
        evenCases += 1;
        assert.equal(xorCyclicShift64(0n, shifts), 0n);
        assert.equal(xorCyclicShift64(MASK64, shifts), 0n);
        assert.ok(rank < WIDTH);
        minEvenRank = Math.min(minEvenRank, rank);
        maxEvenRank = Math.max(maxEvenRank, rank);
      }
      cases += 1;
    }
  }
  return { cases, oddCases, evenCases, minEvenRank, maxEvenRank };
}

/** @returns {Record<string,unknown>} */
function runContractAudit() {
  return {
    model: 'permutation-contract audit of the 2026 author generator primitives',
    polynomialXor: {
      theorem: 'the author parity conditions exactly characterize its XOR-of-monomials permutations',
      exhaustiveSmallWidth: exhaustPolynomialCriterion(),
      uint64BitLifts: runPolynomial64BitLifts()
    },
    xorShift: {
      theorem: 'invertible exactly when the count of zero-distance shifted copies is even',
      randomizedRankChecks: runXorShiftZeroAudit()
    },
    cyclicXor: {
      theorem: 'XOR of c 64-bit rotations is invertible exactly when c is odd',
      randomizedRankChecks: runCyclicParityAudit()
    }
  };
}

if (require.main === module) console.log(JSON.stringify(runContractAudit(), null, 2));

module.exports = {
  MASK64,
  polynomialParityConditions,
  xorPolynomial,
  invertXorPolynomial,
  exhaustPolynomialCriterion,
  runPolynomial64BitLifts,
  xorShift64,
  xorShiftIsPermutation,
  linearRankOf64,
  runXorShiftZeroAudit,
  rotateLeft64,
  xorCyclicShift64,
  linearRank64,
  runCyclicParityAudit,
  runContractAudit
};
