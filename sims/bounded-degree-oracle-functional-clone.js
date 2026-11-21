'use strict';

/** @typedef {(input:number)=>number} UIntOracle */
/** @typedef {{bits:number,degree:number,coefficients:Array<[number,number]>,queryCount:number}} BoundedDegreeModel */

/**
 * Enumerate only n-bit masks with exactly k set bits, without traversing
 * a 2^n-sized truth table. Output masks are unsigned 32-bit numbers.
 * @param {number} bits
 * @param {number} weight
 * @param {number} [first]
 * @param {number} [prefix]
 * @returns {Generator<number>}
 */
function* masksOfWeight(bits, weight, first = 0, prefix = 0) {
  if (weight === 0) {
    yield prefix >>> 0;
    return;
  }
  for (let bit = first; bit <= bits - weight; bit++) {
    yield* masksOfWeight(bits, weight - 1, bit + 1,
      (prefix ^ ((2 ** bit) >>> 0)) >>> 0);
  }
}

/**
 * Recover every coefficient of an n-input, n-output Boolean function
 * promised to have global algebraic degree at most d, with 1<=d<=4.
 * Query the oracle exactly sum(k=0..d) binomial(n,k) times, once
 * per low-weight input. Boolean Mobius inversion gives each coefficient
 * as the XOR of its queried value and all proper subset coefficients.
 *
 * These coefficients completely determine the function, including
 * values on unqueried high-weight inputs, only under the degree promise.
 * @param {UIntOracle} oracle
 * @param {number} bits
 * @param {number} degree
 * @returns {BoundedDegreeModel}
 */
function learnBoundedDegreeOracle(oracle, bits, degree) {
  if (!Number.isInteger(bits) || bits < 1 || bits > 32 ||
      !Number.isInteger(degree) || degree < 1 || degree > Math.min(bits, 4)) {
    throw new RangeError('Expected 1..32 bits and degree 1..min(bits,4)');
  }
  const range = 2 ** bits;
  /** @type {Map<number,number>} */
  const known = new Map();
  /** @type {Array<[number,number]>} */
  const coefficients = [];
  for (let weight = 0; weight <= degree; weight++) {
    for (const mask of masksOfWeight(bits, weight)) {
      let coefficient = oracle(mask);
      if (!Number.isInteger(coefficient) || coefficient < 0 || coefficient >= range) {
        throw new TypeError('Oracle returned value outside n-bit domain');
      }
      coefficient >>>= 0;
      if (mask !== 0) {
        let sub = ((mask - 1) & mask) >>> 0;
        for (;;) {
          const knownCoefficient = known.get(sub);
          if (knownCoefficient === undefined) {
            throw new TypeError('Missing previously interpolated subset');
          }
          coefficient = (coefficient ^ knownCoefficient) >>> 0;
          if (sub === 0) break;
          sub = ((sub - 1) & mask) >>> 0;
        }
      }
      known.set(mask, coefficient);
      coefficients.push([mask, coefficient]);
    }
  }
  return {bits, degree, coefficients, queryCount: coefficients.length};
}

/**
 * Evaluate the complete public-only functional clone. Does not retain
 * or call the learning oracle.
 * @param {BoundedDegreeModel} model
 * @param {number} input
 * @returns {number}
 */
function evaluateBoundedDegreeModel(model, input) {
  let output = 0;
  for (const [mask, coefficient] of model.coefficients) {
    if (((input & mask) >>> 0) === mask) output = (output ^ coefficient) >>> 0;
  }
  return output;
}

module.exports = {learnBoundedDegreeOracle, evaluateBoundedDegreeModel, masksOfWeight};
