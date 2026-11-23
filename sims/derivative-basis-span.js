'use strict';

const assert = require('node:assert/strict');

/** @param {number[]} vectors @param {number} width @returns {number} */
function binaryRank(vectors, width) {
  /** @type {number[]} */
  const pivots = Array(width).fill(0);
  for (const raw of vectors) {
    let value = raw >>> 0;
    for (let bit = width - 1; bit >= 0 && value !== 0; bit--) {
      if (((value >>> bit) & 1) === 0) continue;
      if (pivots[bit]) value = (value ^ pivots[bit]) >>> 0;
      else { pivots[bit] = value; break; }
    }
  }
  return pivots.filter(Boolean).length;
}

/** @param {number[]} basis @returns {number[]} */
function enumerateSpan(basis) {
  const elements = [0];
  for (const direction of basis) {
    const oldCount = elements.length;
    for (let i = 0; i < oldCount; i++) elements.push(elements[i] ^ direction);
  }
  return elements;
}

/** @param {number[]} truth @param {number[]} basis @param {number} outputBits @returns {number} */
function compareDefectSpans(truth, basis, outputBits) {
  const domainSize = truth.length;
  const allDirections = enumerateSpan(basis);
  /** @type {number[]} */
  const generators = [];
  /** @type {number[]} */
  const exhaustive = [];
  const constant = truth[0];
  for (let x = 0; x < domainSize; x++) {
    for (const u of basis) generators.push(truth[x ^ u] ^ truth[x] ^ truth[u] ^ constant);
    for (const v of allDirections) exhaustive.push(truth[x ^ v] ^ truth[x] ^ truth[v] ^ constant);
  }
  const basisRank = binaryRank(generators, outputBits);
  const fullRank = binaryRank(exhaustive, outputBits);
  assert.equal(basisRank, fullRank, 'basis directions failed to span every defect');
  return basisRank;
}

/** @param {number} seed @returns {()=>number} */
function xorshift32(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
}

/** @param {number} width @param {number} count @param {()=>number} next @returns {number[]} */
function independentDirections(width, count, next) {
  /** @type {number[]} */
  const basis = [];
  const mask = (2 ** width) - 1;
  while (basis.length < count) {
    const candidate = next() & mask;
    if (binaryRank([...basis, candidate], width) === basis.length + 1) basis.push(candidate);
  }
  return basis;
}

/**
 * Exact width-two census plus seeded arbitrary vector-output truth tables,
 * including non-coordinate input-subspace bases and non-polynomial functions.
 * This is a finite test; the algebraic cancellation identity proves the lemma.
 * @returns {{exhaustiveWidthTwoCases:number,randomCases:number,seed:number}}
 */
function runBasisSpanCheck() {
  const widthTwoBases = [[], [1], [2], [3], [1, 2], [1, 3], [2, 1], [2, 3], [3, 1], [3, 2]];
  let exhaustiveWidthTwoCases = 0;
  for (let encoding = 0; encoding < 256; encoding++) {
    const truth = [encoding & 3, (encoding >>> 2) & 3, (encoding >>> 4) & 3, (encoding >>> 6) & 3];
    for (const basis of widthTwoBases) {
      compareDefectSpans(truth, basis, 2);
      exhaustiveWidthTwoCases++;
    }
  }
  const seed = 0x71d1ae57;
  const next = xorshift32(seed);
  let randomCases = 0;
  for (let inputBits = 2; inputBits <= 6; inputBits++) {
    const domain = 2 ** inputBits;
    const outputBits = inputBits + 1;
    const outputMask = (2 ** outputBits) - 1;
    for (let trial = 0; trial < 300; trial++) {
      const truth = Array.from({length: domain}, () => next() & outputMask);
      const dimension = next() % (inputBits + 1);
      const basis = independentDirections(inputBits, dimension, next);
      compareDefectSpans(truth, basis, outputBits);
      randomCases++;
    }
  }
  return {exhaustiveWidthTwoCases, randomCases, seed};
}

if (require.main === module) {
  process.stdout.write(`${JSON.stringify(runBasisSpanCheck())}\n`);
}

module.exports = {binaryRank, enumerateSpan, compareDefectSpans, runBasisSpanCheck};
