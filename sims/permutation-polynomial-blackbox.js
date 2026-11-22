'use strict';

const { performance } = require('node:perf_hooks');

const WORD_BITS = 32;
const MODULUS = 1n << 32n;
const MASK32 = MODULUS - 1n;

/** @param {bigint} value @returns {bigint} */
function u32(value) {
  return value & MASK32;
}

/**
 * @param {bigint[]} coefficients
 * @param {bigint} x
 * @param {bigint} [modulus]
 * @returns {bigint}
 */
function evaluatePolynomial(coefficients, x, modulus = MODULUS) {
  let acc = 0n;
  for (let index = coefficients.length - 1; index >= 0; index -= 1) {
    acc = (acc * x + coefficients[index]) % modulus;
  }
  return acc;
}

/**
 * @param {bigint[]} values
 * @returns {bigint[]}
 */
function forwardDifferenceCoefficients(values) {
  const coefficients = [];
  let row = values.map(u32);
  while (row.length > 0) {
    coefficients.push(row[0]);
    const next = [];
    for (let index = 0; index + 1 < row.length; index += 1) {
      next.push(u32(row[index + 1] - row[index]));
    }
    row = next;
  }
  return coefficients;
}

/**
 * @param {bigint} n
 * @param {number} k
 * @returns {bigint}
 */
function binomial(n, k) {
  let value = 1n;
  for (let index = 1; index <= k; index += 1) {
    value = (value * (n - BigInt(index - 1))) / BigInt(index);
  }
  return value;
}

/**
 * @param {bigint[]} newton
 * @param {bigint} x
 * @param {bigint} [modulus]
 * @returns {bigint}
 */
function evaluateNewton(newton, x, modulus = MODULUS) {
  let acc = 0n;
  for (let k = 0; k < newton.length; k += 1) {
    acc = (acc + newton[k] * binomial(x, k)) % modulus;
  }
  return acc;
}

/**
 * Learn a degree-bounded integer polynomial modulo 2^32 from chosen queries.
 * The returned coefficients are in the Newton forward-difference basis.
 *
 * @param {(x: number) => number} query
 * @param {number} degree
 * @returns {{newton: bigint[], queryCount: number}}
 */
function learnPolynomialOracle(query, degree) {
  const values = [];
  for (let x = 0; x <= degree; x += 1) {
    values.push(BigInt(query(x) >>> 0));
  }
  return { newton: forwardDifferenceCoefficients(values), queryCount: degree + 1 };
}

/**
 * Invert a learned permutation polynomial modulo 2^32 one bit at a time.
 * This uses no further oracle queries.
 *
 * @param {bigint[]} newton
 * @param {number} target
 * @returns {number}
 */
function invertPermutation(newton, target) {
  const y = BigInt(target >>> 0);
  let candidate = -1n;
  for (const initial of [0n, 1n]) {
    if (evaluateNewton(newton, initial, 2n) === (y & 1n)) {
      if (candidate !== -1n) throw new Error('non-unique inverse modulo 2');
      candidate = initial;
    }
  }
  if (candidate === -1n) throw new Error('missing inverse modulo 2');

  for (let bit = 1; bit < WORD_BITS; bit += 1) {
    const step = 1n << BigInt(bit);
    const modulus = step << 1n;
    const maskedTarget = y & (modulus - 1n);
    const options = [candidate, candidate + step];
    const matches = options.filter((x) => evaluateNewton(newton, x, modulus) === maskedTarget);
    if (matches.length !== 1) {
      throw new Error(`expected one inverse modulo 2^${bit + 1}, got ${matches.length}`);
    }
    candidate = matches[0];
  }

  return Number(candidate & MASK32) >>> 0;
}

/**
 * @param {number} seed
 * @returns {() => number}
 */
function makeRng(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
}

/**
 * Generate coefficients satisfying Rivest's permutation-polynomial parity
 * conditions for modulus 2^w, w >= 2.
 *
 * @param {number} degree
 * @param {number} seed
 * @returns {bigint[]}
 */
function makePermutationPolynomial(degree, seed) {
  if (degree < 1) throw new Error('degree must be positive');
  const next = makeRng(seed);
  const coefficients = Array.from({ length: degree + 1 }, () => BigInt(next()));
  coefficients[1] |= 1n;
  if (degree >= 2) {
    let evenParity = 0n;
    for (let index = 2; index <= degree; index += 2) evenParity ^= coefficients[index] & 1n;
    if (evenParity !== 0n) coefficients[2] ^= 1n;
  }
  if (degree >= 3) {
    let oddParity = 0n;
    for (let index = 3; index <= degree; index += 2) oddParity ^= coefficients[index] & 1n;
    if (oddParity !== 0n) coefficients[3] ^= 1n;
  }
  if (coefficients[degree] === 0n) coefficients[degree] = 2n;
  return coefficients.map(u32);
}

/** @param {number} value @returns {string} */
function hex32(value) {
  return `0x${(value >>> 0).toString(16).padStart(8, '0')}`;
}

function main() {
  const rows = [];
  for (const degree of [3, 7, 15, 31]) {
    const coefficients = makePermutationPolynomial(degree, 0x9e3779b9 ^ degree);
    let oracleQueries = 0;
    const query = (x) => {
      oracleQueries += 1;
      return Number(evaluatePolynomial(coefficients, BigInt(x >>> 0))) >>> 0;
    };

    const start = performance.now();
    const learned = learnPolynomialOracle(query, degree);
    if (oracleQueries !== degree + 1 || learned.queryCount !== degree + 1) {
      throw new Error('unexpected query count');
    }

    const heldOutRng = makeRng(0xa5a5a5a5 ^ degree);
    for (let index = 0; index < 4096; index += 1) {
      const x = heldOutRng();
      const expected = evaluatePolynomial(coefficients, BigInt(x));
      const actual = evaluateNewton(learned.newton, BigInt(x));
      if (actual !== expected) throw new Error(`reconstruction mismatch for degree ${degree}`);
    }

    const secretRng = makeRng(0x13579bdf ^ degree);
    let finalSecret = 0;
    let finalTarget = 0;
    for (let index = 0; index < 128; index += 1) {
      const secret = secretRng();
      const target = Number(evaluatePolynomial(coefficients, BigInt(secret))) >>> 0;
      const recovered = invertPermutation(learned.newton, target);
      if (recovered !== secret) throw new Error(`inverse mismatch for degree ${degree}`);
      finalSecret = secret;
      finalTarget = target;
    }

    rows.push({
      degree,
      oracleQueries,
      heldOutChecks: 4096,
      inverseChecks: 128,
      lastPublishedTarget: hex32(finalTarget),
      lastRecoveredConstant: hex32(finalSecret),
      elapsedMs: Number((performance.now() - start).toFixed(3)),
    });
  }

  console.log(JSON.stringify({
    model: 'uint32 permutation polynomial black-box learner',
    attackerInput: 'chosen oracle outputs only; no AST, source, seed, or coefficients',
    result: 'all learned functions and inversions matched',
    rows,
  }, null, 2));
}

if (require.main === module) main();

module.exports = {
  forwardDifferenceCoefficients,
  invertPermutation,
  learnPolynomialOracle,
};
