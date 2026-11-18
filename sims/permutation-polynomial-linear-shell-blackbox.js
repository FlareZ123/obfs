'use strict';

const { performance } = require('node:perf_hooks');

const MODULUS = 1n << 32n;
const MASK32 = MODULUS - 1n;
const VALIDATION_COORDINATES = (() => {
  const next = makeRng(0x243f6a88);
  return Array.from({ length: 32 }, () => next());
})();
const ORDERS = [
  ['P', 'X', 'R'],
  ['P', 'R', 'X'],
  ['X', 'P', 'R'],
  ['R', 'P', 'X'],
  ['X', 'R', 'P'],
  ['R', 'X', 'P'],
];

/** @typedef {'P'|'X'|'R'} Stage */
/** @typedef {'left'|'right'} Direction */
/** @typedef {{direction:Direction,shift:number,rotation:number}} LinearSpec */
/** @typedef {{order:Stage[],spec:LinearSpec,newton:bigint[]}} LearnedComposite */

/** @param {number} value @returns {number} */
function u32(value) { return value >>> 0; }
/** @param {bigint} value @returns {bigint} */
function u32n(value) { return value & MASK32; }

/** @param {number} value @param {number} shift @returns {number} */
function rotl(value, shift) {
  const r = shift & 31;
  return r === 0 ? u32(value) : u32((value << r) | (value >>> (32 - r)));
}

/** @param {number} value @param {number} shift @returns {number} */
function rotr(value, shift) {
  const r = shift & 31;
  return r === 0 ? u32(value) : u32((value >>> r) | (value << (32 - r)));
}

/** @param {number} value @param {number} shift @param {Direction} direction @returns {number} */
function xorShift(value, shift, direction) {
  return direction === 'left' ? u32(value ^ (value << shift)) : u32(value ^ (value >>> shift));
}

/** @param {number} value @param {number} shift @param {Direction} direction @returns {number} */
function invertXorShift(value, shift, direction) {
  let result = u32(value);
  for (let offset = shift; offset < 32; offset += shift) {
    result ^= direction === 'left' ? u32(value << offset) : value >>> offset;
  }
  return u32(result);
}

/** @param {number} value @param {Stage[]} stages @param {LinearSpec} spec @returns {number} */
function applyLinearStages(value, stages, spec) {
  let current = u32(value);
  for (const stage of stages) {
    if (stage === 'X') current = xorShift(current, spec.shift, spec.direction);
    else if (stage === 'R') current = rotl(current, spec.rotation);
    else throw new Error('polynomial stage is not linear');
  }
  return current;
}

/** @param {number} value @param {Stage[]} stages @param {LinearSpec} spec @returns {number} */
function invertLinearStages(value, stages, spec) {
  let current = u32(value);
  for (let index = stages.length - 1; index >= 0; index -= 1) {
    const stage = stages[index];
    if (stage === 'X') current = invertXorShift(current, spec.shift, spec.direction);
    else if (stage === 'R') current = rotr(current, spec.rotation);
    else throw new Error('polynomial stage is not linear');
  }
  return current;
}

/** @param {Stage[]} order @returns {{inner:Stage[],outer:Stage[]}} */
function splitOrder(order) {
  const polynomialIndex = order.indexOf('P');
  if (polynomialIndex < 0) throw new Error('order lacks polynomial stage');
  return { inner: order.slice(0, polynomialIndex), outer: order.slice(polynomialIndex + 1) };
}

/** @param {bigint[]} coefficients @param {bigint} x @param {bigint} [modulus] @returns {bigint} */
function evaluatePolynomial(coefficients, x, modulus = MODULUS) {
  let acc = 0n;
  for (let index = coefficients.length - 1; index >= 0; index -= 1) acc = (acc * x + coefficients[index]) % modulus;
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
function invertPolynomial(newton, target) {
  const wanted = BigInt(target >>> 0);
  let value = -1n;
  for (const candidate of [0n, 1n]) {
    if (evaluateNewton(newton, candidate, 2n) === (wanted & 1n)) {
      if (value !== -1n) throw new Error('non-unique inverse modulo 2');
      value = candidate;
    }
  }
  if (value === -1n) throw new Error('missing inverse modulo 2');
  for (let bit = 1; bit < 32; bit += 1) {
    const highBit = 1n << BigInt(bit);
    const modulus = highBit << 1n;
    const reducedTarget = wanted & (modulus - 1n);
    const matches = [value, value + highBit].filter((candidate) => evaluateNewton(newton, candidate, modulus) === reducedTarget);
    if (matches.length !== 1) throw new Error(`expected one inverse modulo 2^${bit + 1}, got ${matches.length}`);
    value = matches[0];
  }
  return Number(value & MASK32) >>> 0;
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

/** @param {number} value @param {bigint[]} coefficients @param {Stage[]} order @param {LinearSpec} spec @returns {number} */
function evaluateComposite(value, coefficients, order, spec) {
  const { inner, outer } = splitOrder(order);
  const polynomialInput = applyLinearStages(value, inner, spec);
  const polynomialOutput = Number(evaluatePolynomial(coefficients, BigInt(polynomialInput))) >>> 0;
  return applyLinearStages(polynomialOutput, outer, spec);
}

/**
 * @param {(x:number)=>number} oracle
 * @param {number} degree
 * @returns {{learned:LearnedComposite,equivalentCandidates:number,queryCount:number,candidatesTested:number}}
 */
function learnThreeStageComposite(oracle, degree) {
  /** @type {Map<number,number>} */
  const cache = new Map();
  const query = (input) => {
    const key = u32(input);
    const prior = cache.get(key);
    if (prior !== undefined) return prior;
    const output = oracle(key);
    cache.set(key, output);
    return output;
  };
  /** @type {LearnedComposite[]} */
  const matches = [];
  let candidatesTested = 0;
  for (const order of /** @type {Stage[][]} */(ORDERS)) {
    const { inner, outer } = splitOrder(order);
    for (const direction of /** @type {Direction[]} */(['left', 'right'])) {
      for (let shift = 1; shift < 32; shift += 1) {
        for (let rotation = 1; rotation < 32; rotation += 1) {
          candidatesTested += 1;
          const spec = { direction, shift, rotation };
          const baseValues = [];
          for (let coordinate = 0; coordinate <= degree; coordinate += 1) {
            const input = invertLinearStages(coordinate, inner, spec);
            const output = query(input);
            baseValues.push(BigInt(invertLinearStages(output, outer, spec)));
          }
          const newton = forwardDifferenceCoefficients(baseValues);
          let valid = true;
          for (const coordinate of VALIDATION_COORDINATES) {
            const input = invertLinearStages(coordinate, inner, spec);
            const output = query(input);
            const polynomialOutput = invertLinearStages(output, outer, spec);
            if (evaluateNewton(newton, BigInt(coordinate)) !== BigInt(polynomialOutput)) {
              valid = false;
              break;
            }
          }
          if (valid) matches.push({ order: [...order], spec, newton });
        }
      }
    }
  }
  if (matches.length === 0) throw new Error('no three-stage decomposition survived');
  return { learned: matches[0], equivalentCandidates: matches.length, queryCount: cache.size, candidatesTested };
}

/** @param {number} value @returns {string} */
function hex32(value) { return `0x${u32(value).toString(16).padStart(8, '0')}`; }

function main() {
  const rows = [];
  let totalHeldOut = 0;
  let totalInversions = 0;
  let totalCases = 0;
  for (const degree of [3, 7, 15]) {
    const timings = [];
    const queryCounts = [];
    const equivalentCounts = [];
    for (let orderIndex = 0; orderIndex < ORDERS.length; orderIndex += 1) {
      for (let repetition = 0; repetition < 3; repetition += 1) {
      const seed = u32(0x6a09e667 ^ (degree * 0x10001) ^ (orderIndex * 0x9e37) ^ (repetition * 0x85ebca6b));
      const next = makeRng(seed ^ 0xbb67ae85);
      const coefficients = makePermutationPolynomial(degree, seed);
      const order = /** @type {Stage[]} */([...ORDERS[orderIndex]]);
      /** @type {LinearSpec} */
      const spec = {
        direction: (next() & 1) === 0 ? 'left' : 'right',
        shift: 1 + (next() % 31),
        rotation: 1 + (next() % 31),
      };
      let rawQueries = 0;
      const oracle = (value) => {
        rawQueries += 1;
        return evaluateComposite(value, coefficients, order, spec);
      };
      const start = performance.now();
      const attack = learnThreeStageComposite(oracle, degree);
      timings.push(performance.now() - start);
      queryCounts.push(attack.queryCount);
      equivalentCounts.push(attack.equivalentCandidates);
      if (rawQueries !== attack.queryCount) throw new Error('query cache accounting mismatch');
      const heldOutRng = makeRng(seed ^ 0x3c6ef372);
      for (let index = 0; index < 512; index += 1) {
        const value = heldOutRng();
        const expected = evaluateComposite(value, coefficients, order, spec);
        const { inner, outer } = splitOrder(attack.learned.order);
        const polynomialInput = applyLinearStages(value, inner, attack.learned.spec);
        const polynomialOutput = Number(evaluateNewton(attack.learned.newton, BigInt(polynomialInput))) >>> 0;
        const actual = applyLinearStages(polynomialOutput, outer, attack.learned.spec);
        if (actual !== expected) throw new Error('held-out composite mismatch');
      }

      const secretRng = makeRng(seed ^ 0xa54ff53a);
      const { inner, outer } = splitOrder(attack.learned.order);
      let exampleTarget = 0;
      let exampleRecovered = 0;
      for (let index = 0; index < 16; index += 1) {
        const secret = secretRng();
        const target = evaluateComposite(secret, coefficients, order, spec);
        const polynomialTarget = invertLinearStages(target, outer, attack.learned.spec);
        const polynomialInput = invertPolynomial(attack.learned.newton, polynomialTarget);
        const recovered = invertLinearStages(polynomialInput, inner, attack.learned.spec);
        if (recovered !== secret) throw new Error('target inversion mismatch');
        exampleTarget = target;
        exampleRecovered = recovered;
      }
      totalCases += 1;
      totalHeldOut += 512;
      totalInversions += 16;
      if (orderIndex === 0 && repetition === 0) rows.push({ degree, exampleOrder: order.join('->'), exampleSpec: spec, exampleTarget: hex32(exampleTarget), exampleRecovered: hex32(exampleRecovered) });
      }
    }
    const row = rows.find((candidate) => candidate.degree === degree);
    if (!row) throw new Error('missing degree row');
    const sortedTimings = [...timings].sort((a, b) => a - b);
    row.medianAttackMs = Number(sortedTimings[Math.floor(sortedTimings.length / 2)].toFixed(3));
    row.minQueries = Math.min(...queryCounts);
    row.maxQueries = Math.max(...queryCounts);
    row.candidatesTested = 6 * 2 * 31 * 31;
    row.minEquivalentCandidates = Math.min(...equivalentCounts);
    row.maxEquivalentCandidates = Math.max(...equivalentCounts);
  }
  console.log(JSON.stringify({
    model: 'source-blind chosen-query recovery of one polynomial, one xor-shift, and one nonzero rotation in any order',
    result: 'a functionally sufficient decomposition survived every case; all held-out functions and published-target inversions matched',
    cases: totalCases,
    heldOutChecks: totalHeldOut,
    inversionChecks: totalInversions,
    validationCoordinates: VALIDATION_COORDINATES.map(hex32),
    rows,
    scope: 'synthetic exact-three-stage family; not the expanded MBA construction from Wang et al.',
  }, null, 2));
}

if (require.main === module) main();
