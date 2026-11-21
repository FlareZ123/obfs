'use strict';

const assert = require('node:assert/strict');

/** @param {number[]} vectors @param {number} bits @returns {number} */
function rank(vectors, bits) {
  const basis = Array(bits).fill(0);
  let count = 0;
  for (const original of vectors) {
    let x = original >>> 0;
    for (let bit = bits - 1; bit >= 0 && x !== 0; bit--) {
      if (!((x >>> bit) & 1)) continue;
      if (basis[bit]) x = (x ^ basis[bit]) >>> 0;
      else {
        basis[bit] = x;
        count++;
        break;
      }
    }
  }
  return count;
}

/** @param {number[]} columns @param {number} x @returns {number} */
function linear(columns, x) {
  let result = 0;
  for (let bit = 0; bit < columns.length; bit++) {
    if ((x >>> bit) & 1) result = (result ^ columns[bit]) >>> 0;
  }
  return result;
}

/**
 * Rank of the span of all affine-interpolation defects.
 * @param {number[]} outputs
 * @param {number} bits
 * @returns {number}
 */
function interpolationRank(outputs, bits) {
  const constant = outputs[0];
  const interpolant = Array.from({length: bits}, (_, i) =>
    (outputs[2 ** i] ^ constant) >>> 0);
  const residuals = outputs.map((output, x) =>
    (output ^ constant ^ linear(interpolant, x)) >>> 0);
  return rank(residuals, bits);
}

/** @param {number[]} outputs @param {number} bits @returns {number} */
function parallelogramRank(outputs, bits) {
  const values = [];
  for (let u = 0; u < 2 ** bits; u++) {
    for (let v = 0; v < 2 ** bits; v++) {
      values.push((outputs[0] ^ outputs[u] ^ outputs[v] ^ outputs[u ^ v]) >>> 0);
    }
  }
  return rank(values, bits);
}

/** @param {number[]} values @returns {Generator<number[]>} */
function* permutations(values) {
  if (values.length === 0) {
    yield [];
    return;
  }
  for (let i = 0; i < values.length; i++) {
    const others = [...values.slice(0, i), ...values.slice(i + 1)];
    for (const rest of permutations(others)) yield [values[i], ...rest];
  }
}

/** @returns {number[][]} */
function allInvertibleMatrices3() {
  const matrices = [];
  for (let a = 0; a < 8; a++) {
    for (let b = 0; b < 8; b++) {
      for (let c = 0; c < 8; c++) {
        const cols = [a, b, c];
        if (rank(cols, 3) === 3) matrices.push(cols);
      }
    }
  }
  assert.equal(matrices.length, 168);
  return matrices;
}

/**
 * Exhaustively search invertible affine linear baselines for the true minimum
 * rank of the residual span. Only run on sampled permutations, not the full
 * 40320 x 168 grid, to keep the workflow lightweight.
 * @param {number[]} outputs
 * @param {number[][]} matrices
 * @returns {number}
 */
function bruteMinimalRank(outputs, matrices) {
  const c = outputs[0];
  let minimum = 3;
  for (const matrix of matrices) {
    const errors = outputs.map((value, input) =>
      (value ^ c ^ linear(matrix, input)) >>> 0);
    minimum = Math.min(minimum, rank(errors, 3));
  }
  return minimum;
}

/**
 * Transform every output by invertible input and output affine coordinates.
 * These maps are independent of the given permutation.
 * @param {number[]} outputs
 * @returns {number[]}
 */
function affineConjugate(outputs) {
  const incoming = [2, 3, 4];
  const outgoing = [5, 2, 4];
  assert.equal(rank(incoming, 3), 3);
  assert.equal(rank(outgoing, 3), 3);
  return Array.from({length: 8}, (_, x) =>
    linear(outgoing, outputs[linear(incoming, x) ^ 5]) ^ 6);
}

/**
 * For every q from the 9 affine-basis inputs through 254 of 256 points,
 * construct a pair of different permutations giving exactly the same
 * q-query transcript. One is affine identity (residual rank zero), while
 * the other swaps two remaining inputs (residual rank one).
 * @returns {number}
 */
function noncertifyingTranscripts() {
  const n = 8;
  const domain = 2 ** n;
  const basisInputs = [0, ...Array.from({length: n}, (_, i) => 2 ** i)];
  const queriedOrder = [...basisInputs, ...Array.from({length: domain}, (_, x) => x)
    .filter(x => !basisInputs.includes(x))];
  let checked = 0;
  for (let q = n + 1; q <= domain - 2; q++) {
    const a = queriedOrder[q];
    const b = queriedOrder[q + 1];
    const alternative = Array.from({length: domain}, (_, x) => x);
    [alternative[a], alternative[b]] = [alternative[b], alternative[a]];
    for (const input of queriedOrder.slice(0, q)) assert.equal(alternative[input], input);
    assert.equal(new Set(alternative).size, domain);
    assert.equal(interpolationRank(alternative, n), 1);
    checked++;
  }
  assert.equal(checked, 246);
  return checked;
}

/**
 * Count all masks giving scalar affine output components. There are exactly
 * 2^(n-residualRank) such masks, including the zero mask.
 * @param {number[]} outputs
 * @param {number} bits
 * @returns {number}
 */
function affineOutputMaskDimension(outputs, bits) {
  const base = outputs[0];
  const interpolant = Array.from({length: bits}, (_, bit) =>
    (outputs[2 ** bit] ^ base) >>> 0);
  let count = 0;
  /** @param {number} value @returns {number} */
  function parity(value) {
    let x = value >>> 0;
    x ^= x >>> 16;
    x ^= x >>> 8;
    x ^= x >>> 4;
    x ^= x >>> 2;
    x ^= x >>> 1;
    return x & 1;
  }
  for (let mask = 0; mask < 2 ** bits; mask++) {
    const affine = outputs.every((value, x) =>
      parity(mask & value) === parity(mask & (base ^ linear(interpolant, x))));
    if (affine) count++;
  }
  assert.equal(Math.log2(count), Math.floor(Math.log2(count)));
  return Math.log2(count);
}

function main() {
  const matrices = allInvertibleMatrices3();
  const classes = Array(4).fill(0);
  let permutationsChecked = 0;
  let minimalRankChecks = 0;
  for (const f of permutations([0, 1, 2, 3, 4, 5, 6, 7])) {
    const observed = interpolationRank(f, 3);
    assert.equal(parallelogramRank(f, 3), observed);
    assert.equal(affineOutputMaskDimension(f, 3), 3 - observed);
    assert.equal(interpolationRank(affineConjugate(f), 3), observed);
    classes[observed]++;
    if (permutationsChecked % 317 === 0) {
      assert.equal(bruteMinimalRank(f, matrices), observed);
      minimalRankChecks++;
    }
    permutationsChecked++;
  }
  assert.equal(permutationsChecked, 40320);
  assert.deepEqual(classes, [1344, 9408, 18816, 10752]);
  assert.equal(minimalRankChecks, 128);
  const spoofedTranscriptLengths = noncertifyingTranscripts();
  process.stdout.write(JSON.stringify({
    width: 3, permutationsChecked, minimalRankChecks,
    parallelogramIdentityChecks: permutationsChecked,
    affineCoordinateInvarianceChecks: permutationsChecked,
    rankDistribution: classes, spoofedTranscriptLengths
  }) + '\n');
}

if (require.main === module) main();
module.exports = {interpolationRank, parallelogramRank};
