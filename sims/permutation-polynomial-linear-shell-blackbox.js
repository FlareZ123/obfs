'use strict';

const { performance } = require('node:perf_hooks');

const MODULUS = 1n << 32n;
const MASK32 = MODULUS - 1n;

/** @param {bigint} value @returns {bigint} */
function u32n(value) { return value & MASK32; }
/** @param {number} value @returns {number} */
function u32(value) { return value >>> 0; }

/** @param {number} value @param {number} shift @returns {number} */
function rotl(value, shift) {
  const r = shift & 31;
  if (r === 0) return u32(value);
  return u32((value << r) | (value >>> (32 - r)));
}

/** @param {number} value @param {number} shift @returns {number} */
function rotr(value, shift) {
  const r = shift & 31;
  if (r === 0) return u32(value);
  return u32((value >>> r) | (value << (32 - r)));
}

/** @param {number} value @param {number} shift @returns {number} */
function xorShiftRight(value, shift) { return u32(value ^ (value >>> shift)); }
/** @param {number} value @param {number} shift @returns {number} */
function xorShiftLeft(value, shift) { return u32(value ^ (value << shift)); }

/** @param {number} value @param {number} shift @returns {number} */
function invertXorShiftRight(value, shift) {
  let result = u32(value);
  for (let offset = shift; offset < 32; offset += shift) result ^= value >>> offset;
  return u32(result);
}

/** @param {number} value @param {number} shift @returns {number} */
function invertXorShiftLeft(value, shift) {
  let result = u32(value);
  for (let offset = shift; offset < 32; offset += shift) result ^= u32(value << offset);
  return u32(result);
}

/**
 * @typedef {'left'|'right'} Direction
 * @typedef {'xor-rotate'|'rotate-xor'} OuterOrder
 * @typedef {{direction:Direction, order:OuterOrder, shift:number, rotation:number}} OuterSpec
 */

/** @param {number} value @param {OuterSpec} spec @returns {number} */
function applyOuter(value, spec) {
  const xor = spec.direction === 'left' ? xorShiftLeft : xorShiftRight;
  if (spec.order === 'xor-rotate') return rotl(xor(value, spec.shift), spec.rotation);
  return xor(rotl(value, spec.rotation), spec.shift);
}

/** @param {number} value @param {OuterSpec} spec @returns {number} */
function invertOuter(value, spec) {
  const invertXor = spec.direction === 'left' ? invertXorShiftLeft : invertXorShiftRight;
  if (spec.order === 'xor-rotate') return invertXor(rotr(value, spec.rotation), spec.shift);
  return rotr(invertXor(value, spec.shift), spec.rotation);
}

/** @param {bigint[]} coefficients @param {bigint} x @param {bigint} [modulus] @returns {bigint} */
function evaluatePolynomial(coefficients, x, modulus = MODULUS) {
  let acc = 0n;
  for (let index = coefficients.length - 1; index >= 0; index -= 1) {
    acc = (acc * x + coefficients[index]) % modulus;
  }
  return acc;
}

/** @param {bigint[]} values @returns {bigint[]} */
function forwardDifferenceCoefficients(values) {
  const coefficients = [];
  let row = values.map(u32n);
  while (row.length > 0) {
    coefficients.push(row[0]);
    const next = [];
    for (let index = 0; index + 1 < row.length; index += 1) next.push(u32n(row[index + 1] - row[index]));
    row = next;
  }
  return coefficients;
}

/** @param {bigint} n @param {number} k @returns {bigint} */
function binomial(n, k) {
  let value = 1n;
  for (let index = 1; index <= k; index += 1) value = (value * (n - BigInt(index - 1))) / BigInt(index);
  return value;
}

/** @param {bigint[]} newton @param {bigint} x @param {bigint} [modulus] @returns {bigint} */
function evaluateNewton(newton, x, modulus = MODULUS) {
  let acc = 0n;
  for (let k = 0; k < newton.length; k += 1) acc = (acc + newton[k] * binomial(x, k)) % modulus;
  return acc;
}

/** @param {bigint[]} newton @param {number} target @returns {number} */
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
  for (let bit = 1; bit < 32; bit += 1) {
    const step = 1n << BigInt(bit);
    const modulus = step << 1n;
    const targetBits = y & (modulus - 1n);
    const matches = [candidate, candidate + step].filter((x) => evaluateNewton(newton, x, modulus) === targetBits);
    if (matches.length !== 1) throw new Error(`expected one inverse modulo 2^${bit + 1}, got ${matches.length}`);
    candidate = matches[0];
  }
  return Number(candidate & MASK32) >>> 0;
}

/** @param {number} seed @returns {() => number} */
function makeRng(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
}

/** @param {number} degree @param {number} seed @returns {bigint[]} */
function makePermutationPolynomial(degree, seed) {
  const next = makeRng(seed);
  const coefficients = Array.from({ length: degree + 1 }, () => BigInt(next()));
  coefficients[1] |= 1n;
  if (degree >= 2) {
    let parity = 0n;
    for (let index = 2; index <= degree; index += 2) parity ^= coefficients[index] & 1n;
    if (parity !== 0n) coefficients[2] ^= 1n;
  }
  if (degree >= 3) {
    let parity = 0n;
    for (let index = 3; index <= degree; index += 2) parity ^= coefficients[index] & 1n;
    if (parity !== 0n) coefficients[3] ^= 1n;
  }
  if (coefficients[degree] === 0n) coefficients[degree] = 2n;
  return coefficients.map(u32n);
}

/**
 * @typedef {{spec:OuterSpec,newton:bigint[]}} LearnedComposite
 */

/**
 * Learn P hidden inside either R(X(P(x))) or X(R(P(x))), where X is one
 * unknown left/right xor-shift and R is one unknown 32-bit rotation.
 *
 * @param {(x:number)=>number} query
 * @param {number} degree
 * @param {number} validationPoints
 * @returns {{queryCount:number,candidatesTested:number,learned:LearnedComposite}}
 */
function learnComposite(query, degree, validationPoints) {
  const outputs = [];
  const queryCount = degree + 1 + validationPoints;
  for (let x = 0; x < queryCount; x += 1) outputs.push(query(x));
  /** @type {LearnedComposite[]} */
  const matches = [];
  let candidatesTested = 0;
  for (const direction of /** @type {Direction[]} */(['left', 'right'])) {
    for (const order of /** @type {OuterOrder[]} */(['xor-rotate', 'rotate-xor'])) {
      for (let shift = 1; shift < 32; shift += 1) {
        for (let rotation = 0; rotation < 32; rotation += 1) {
          candidatesTested += 1;
          const spec = { direction, order, shift, rotation };
          const polynomialValues = outputs.map((value) => BigInt(invertOuter(value, spec)));
          const newton = forwardDifferenceCoefficients(polynomialValues.slice(0, degree + 1));
          let valid = true;
          for (let offset = 0; offset < validationPoints; offset += 1) {
            const x = degree + 1 + offset;
            if (evaluateNewton(newton, BigInt(x)) !== polynomialValues[x]) {
              valid = false;
              break;
            }
          }
          if (valid) matches.push({ spec, newton });
        }
      }
    }
  }
  if (matches.length !== 1) throw new Error(`expected one composite candidate, got ${matches.length}`);
  return { queryCount, candidatesTested, learned: matches[0] };
}

/** @param {number} value @returns {string} */
function hex32(value) { return `0x${u32(value).toString(16).padStart(8, '0')}`; }

function main() {
  const rows = [];
  let totalCases = 0;
  let totalHeldOut = 0;
  let totalInversions = 0;
  for (const degree of [3, 7, 15]) {
    const caseTimes = [];
    for (let caseIndex = 0; caseIndex < 8; caseIndex += 1) {
      const seed = u32(0x9e3779b9 ^ (degree * 0x10001) ^ caseIndex);
      const next = makeRng(seed ^ 0xa5a5a5a5);
      const coefficients = makePermutationPolynomial(degree, seed);
      /** @type {OuterSpec} */
      const actualSpec = {
        direction: (next() & 1) === 0 ? 'left' : 'right',
        order: (next() & 1) === 0 ? 'xor-rotate' : 'rotate-xor',
        shift: 1 + (next() % 31),
        rotation: next() % 32,
      };
      let oracleQueries = 0;
      const query = (x) => {
        oracleQueries += 1;
        return applyOuter(Number(evaluatePolynomial(coefficients, BigInt(x >>> 0))) >>> 0, actualSpec);
      };
      const start = performance.now();
      const result = learnComposite(query, degree, 5);
      if (oracleQueries !== degree + 6 || result.queryCount !== degree + 6) throw new Error('unexpected query count');
      if (JSON.stringify(result.learned.spec) !== JSON.stringify(actualSpec)) throw new Error('outer transform recovery mismatch');

      const heldOutRng = makeRng(seed ^ 0xc3c3c3c3);
      for (let index = 0; index < 1024; index += 1) {
        const x = heldOutRng();
        const learnedPolynomial = Number(evaluateNewton(result.learned.newton, BigInt(x))) >>> 0;
        const actual = applyOuter(Number(evaluatePolynomial(coefficients, BigInt(x))) >>> 0, actualSpec);
        const predicted = applyOuter(learnedPolynomial, result.learned.spec);
        if (predicted !== actual) throw new Error('held-out composite mismatch');
      }

      const secretRng = makeRng(seed ^ 0x5a5a5a5a);
      let finalSecret = 0;
      let finalTarget = 0;
      for (let index = 0; index < 32; index += 1) {
        const secret = secretRng();
        const target = applyOuter(Number(evaluatePolynomial(coefficients, BigInt(secret))) >>> 0, actualSpec);
        const polynomialTarget = invertOuter(target, result.learned.spec);
        const recovered = invertPermutation(result.learned.newton, polynomialTarget);
        if (recovered !== secret) throw new Error('published target inversion mismatch');
        finalSecret = secret;
        finalTarget = target;
      }
      caseTimes.push(performance.now() - start);
      totalCases += 1;
      totalHeldOut += 1024;
      totalInversions += 32;
      if (caseIndex === 0) {
        rows.push({
          degree,
          queryCount: result.queryCount,
          candidatesTested: result.candidatesTested,
          exampleRecoveredOuter: result.learned.spec,
          exampleTarget: hex32(finalTarget),
          exampleRecoveredConstant: hex32(finalSecret),
        });
      }
    }
    const example = rows.find((row) => row.degree === degree);
    if (!example) throw new Error('missing degree summary');
    example.medianCaseMs = Number(caseTimes.sort((a, b) => a - b)[Math.floor(caseTimes.length / 2)].toFixed(3));
  }
  console.log(JSON.stringify({
    model: 'source-blind oracle attack on polynomial plus one xor-shift plus one rotation',
    family: 'unknown left/right xor-shift; unknown rotation; either xor-then-rotate or rotate-then-xor',
    result: 'all outer parameters, held-out functions, and published-target inversions recovered',
    cases: totalCases,
    heldOutChecks: totalHeldOut,
    inversionChecks: totalInversions,
    rows,
    scope: 'synthetic bounded sequential family; not a reproduction of the full 2026 Wang et al. construction',
  }, null, 2));
}

if (require.main === module) main();
