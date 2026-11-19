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
  profileFiniteDifferenceResidual32,
};
