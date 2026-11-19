'use strict';

const assert = require('node:assert/strict');

/** @param {number} value @returns {number} */
function u32(value) {
  return value >>> 0;
}

/** @param {number} value @returns {number} */
function bitCount(value) {
  let x = value >>> 0;
  let count = 0;
  while (x !== 0) {
    count += x & 1;
    x >>>= 1;
  }
  return count;
}

/** @param {number[]} vectors @returns {number[]} */
function gf2Basis32(vectors) {
  const pivots = Array(32).fill(0);
  const result = [];
  for (const original of vectors) {
    let value = u32(original);
    for (let bit = 31; bit >= 0 && value !== 0; bit -= 1) {
      if (((value >>> bit) & 1) === 0) continue;
      if (pivots[bit] !== 0) {
        value = u32(value ^ pivots[bit]);
      } else {
        pivots[bit] = value;
        result.push(u32(original));
        break;
      }
    }
  }
  return result;
}

/**
 * Compute vector-valued ANF coefficients indexed by input-variable subset.
 * @param {number[]} outputs truth table in binary input order
 * @returns {number[]}
 */
function vectorAnfCoefficients(outputs) {
  assert.ok(outputs.length >= 2, 'truth table must contain at least one input bit');
  const inputBits = Math.log2(outputs.length);
  assert.ok(Number.isInteger(inputBits), 'truth-table length must be a power of two');
  const coefficients = outputs.map(u32);
  for (let bit = 0; bit < inputBits; bit += 1) {
    for (let subset = 0; subset < coefficients.length; subset += 1) {
      if (((subset >>> bit) & 1) !== 0) {
        coefficients[subset] = u32(
          coefficients[subset] ^ coefficients[subset ^ (1 << bit)],
        );
      }
    }
  }
  return coefficients;
}

/**
 * For each degree threshold k, rankByMaxDegree[k] is the dimension of the
 * coefficient span above degree k. It is the least output-subspace dimension
 * that must be quotiented out to make the vector function degree <= k.
 * @param {number[]} outputs
 * @returns {{
 *   inputBits:number,
 *   algebraicDegree:number,
 *   residualRank:number,
 *   rankByMaxDegree:number[],
 *   nonlinearCoefficientBasis:number[]
 * }}
 */
function profileVectorBooleanFunction(outputs) {
  const coefficients = vectorAnfCoefficients(outputs);
  const inputBits = Math.log2(outputs.length);
  let algebraicDegree = 0;

  for (let subset = 0; subset < coefficients.length; subset += 1) {
    if (coefficients[subset] !== 0) {
      algebraicDegree = Math.max(algebraicDegree, bitCount(subset));
    }
  }

  const rankByMaxDegree = [];
  for (let maxDegree = 0; maxDegree <= inputBits; maxDegree += 1) {
    const aboveDegree = [];
    for (let subset = 0; subset < coefficients.length; subset += 1) {
      if (bitCount(subset) > maxDegree && coefficients[subset] !== 0) {
        aboveDegree.push(coefficients[subset]);
      }
    }
    rankByMaxDegree.push(gf2Basis32(aboveDegree).length);
  }

  const nonlinearCoefficientBasis = gf2Basis32(
    coefficients.filter(
      (coefficient, subset) => coefficient !== 0 && bitCount(subset) >= 2,
    ),
  );

  return {
    inputBits,
    algebraicDegree,
    residualRank: nonlinearCoefficientBasis.length,
    rankByMaxDegree,
    nonlinearCoefficientBasis,
  };
}

module.exports = {
  bitCount,
  gf2Basis32,
  profileVectorBooleanFunction,
  vectorAnfCoefficients,
};
