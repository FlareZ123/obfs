'use strict';

const {randomBytes} = require('node:crypto');
const {gf2Basis32} = require('./vector-boolean-profile.js');

const WIDTH = 32;

/** @param {number} value @returns {number} */
function u32(value) {
  return value >>> 0;
}

/** @param {number} bit @returns {number} */
function bitMask(bit) {
  return 2 ** bit;
}

/** @param {number} seed @returns {()=>number} */
function makeRng32(seed) {
  let state = u32(seed) || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state = u32(state);
    return state;
  };
}


/** @param {number} value @returns {number} */
function bitCount32(value) {
  let x = u32(value);
  let count = 0;
  while (x !== 0) {
    count += x & 1;
    x >>>= 1;
  }
  return count;
}

/**
 * Enumerate all 32-bit masks of Hamming weight at most maxWeight.
 * @param {number} maxWeight
 * @returns {number[]}
 */
function masksThroughWeight32(maxWeight) {
  if (!Number.isInteger(maxWeight) || maxWeight < 0 || maxWeight > WIDTH) {
    throw new RangeError('maxWeight must be an integer from 0 through 32');
  }
  /** @type {number[]} */
  const masks = [0];

  /**
   * @param {number} nextBit
   * @param {number} remaining
   * @param {number} mask
   */
  const visit = (nextBit, remaining, mask) => {
    if (remaining === 0) {
      masks.push(u32(mask));
      return;
    }
    for (let bit = nextBit; bit <= WIDTH - remaining; bit += 1) {
      visit(bit + 1, remaining - 1, u32(mask ^ bitMask(bit)));
    }
  };

  for (let weight = 1; weight <= maxWeight; weight += 1) {
    visit(0, weight, 0);
  }
  return masks;
}

/**
 * Exact ANF/residual profile for a 32-bit oracle when maxDegree is an externally
 * established upper bound on the vector Boolean algebraic degree. The routine
 * does not prove that degree bound; violating the contract can hide omitted
 * higher-degree coefficients.
 *
 * @param {(input:number)=>number} oracle
 * @param {number} maxDegree
 * @returns {{
 *   maxDegree:number,
 *   queries:number,
 *   residualRank:number,
 *   rankByMaxDegree:number[],
 *   coefficients:Map<number,number>
 * }}
 */
function profileBoundedDegreeOracle32(oracle, maxDegree) {
  if (!Number.isInteger(maxDegree) || maxDegree < 0 || maxDegree > WIDTH) {
    throw new RangeError('maxDegree must be an integer from 0 through 32');
  }
  const masks = masksThroughWeight32(maxDegree);
  /** @type {Map<number, number>} */
  const values = new Map();
  for (const mask of masks) values.set(mask, u32(oracle(mask)));

  /** @type {Map<number, number>} */
  const coefficients = new Map();
  for (const mask of masks) {
    let coefficient = 0;
    let subset = mask;
    while (true) {
      const value = values.get(subset);
      if (value === undefined) throw new Error('missing bounded-degree truth-table point');
      coefficient = u32(coefficient ^ value);
      if (subset === 0) break;
      subset = u32((subset - 1) & mask);
    }
    coefficients.set(mask, coefficient);
  }

  const rankByMaxDegree = [];
  for (let threshold = 0; threshold <= maxDegree; threshold += 1) {
    const above = [];
    for (const [mask, coefficient] of coefficients) {
      if (coefficient !== 0 && bitCount32(mask) > threshold) above.push(coefficient);
    }
    rankByMaxDegree.push(gf2Basis32(above).length);
  }

  return {
    maxDegree,
    queries: values.size,
    residualRank: maxDegree < 2 ? 0 : rankByMaxDegree[1],
    rankByMaxDegree,
    coefficients,
  };
}

/**
 * Observe a frame-free lower bound on the public affine-residual rank of a
 * 32-bit vector oracle using second finite differences.
 *
 * The deterministic phase evaluates 0, every basis vector and every pairwise
 * basis XOR, requiring at most 529 distinct oracle calls. Optional random
 * parallelograms can only increase the certified lower bound.
 *
 * @param {(input:number)=>number} oracle
 * @param {{randomSamples?:number,seed?:number}} [options]
 * @returns {{
 *   basisPairRank:number,
 *   observedRank:number,
 *   fullRankCertified:boolean,
 *   queries:number,
 *   randomSamplesUsed:number,
 *   defectBasis:number[]
 * }}
 */
function profileFiniteDifferenceResidual32(oracle, options = {}) {
  const randomSamples = options.randomSamples ?? 0;
  const seededNext = options.seed === undefined ? null : makeRng32(options.seed);
  const next = seededNext ?? (() => randomBytes(4).readUInt32LE(0));
  /** @type {Map<number, number>} */
  const cache = new Map();

  /** @param {number} input @returns {number} */
  const query = (input) => {
    const key = u32(input);
    const prior = cache.get(key);
    if (prior !== undefined) return prior;
    const output = u32(oracle(key));
    cache.set(key, output);
    return output;
  };

  /** @type {number[]} */
  const defects = [];
  const base = query(0);
  const basisOutputs = Array.from({length: WIDTH}, (_, bit) => query(bitMask(bit)));

  for (let left = 0; left < WIDTH; left += 1) {
    for (let right = left + 1; right < WIDTH; right += 1) {
      const defect = u32(
        base
        ^ basisOutputs[left]
        ^ basisOutputs[right]
        ^ query(u32(bitMask(left) ^ bitMask(right))),
      );
      if (defect !== 0) defects.push(defect);
    }
  }

  let defectBasis = gf2Basis32(defects);
  const basisPairRank = defectBasis.length;
  let randomSamplesUsed = 0;

  while (randomSamplesUsed < randomSamples && defectBasis.length < WIDTH) {
    const x = next();
    const a = next();
    const b = next();
    const defect = u32(
      query(x)
      ^ query(u32(x ^ a))
      ^ query(u32(x ^ b))
      ^ query(u32(x ^ a ^ b)),
    );
    randomSamplesUsed += 1;
    if (defect !== 0) defectBasis = gf2Basis32([...defectBasis, defect]);
  }

  return {
    basisPairRank,
    observedRank: defectBasis.length,
    fullRankCertified: defectBasis.length === WIDTH,
    queries: cache.size,
    randomSamplesUsed,
    defectBasis,
  };
}

module.exports = {
  masksThroughWeight32,
  profileBoundedDegreeOracle32,
  profileFiniteDifferenceResidual32,
};
