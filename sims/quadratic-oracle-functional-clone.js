'use strict';

/** @typedef {(input:number)=>number} UIntOracle */
/**
 * Plain serializable public-query reconstruction of a quadratic Boolean map.
 * @typedef {{bits:number,constant:number,linear:number[],quadratic:number[][],queryCount:number}} QuadraticModel
 */

/**
 * Reconstruct the exact complete input/output function of a promised
 * degree-at-most-two vectorial Boolean map, without its source code.
 * The 1+n+binom(n,2) chosen basis/pair evaluations are sufficient for
 * every input in GF(2)^n. Bijectivity is not required.
 *
 * This promise is critical. A nonquadratic function can match all
 * training answers and still differ on higher-weight inputs.
 *
 * @param {UIntOracle} oracle
 * @param {number} bits
 * @returns {QuadraticModel}
 */
function learnQuadraticOracle(oracle, bits) {
  if (!Number.isInteger(bits) || bits < 1 || bits > 32) {
    throw new RangeError('Expected width from 1 to 32 bits');
  }
  const limit = 2 ** bits;
  /** @param {number} input @returns {number} */
  const checkedQuery = input => {
    const output = oracle(input);
    if (!Number.isInteger(output) || output < 0 || output >= limit) {
      throw new TypeError('Oracle returned value outside the n-bit domain');
    }
    return output >>> 0;
  };
  const constant = checkedQuery(0);
  const linear = Array.from({length: bits}, (_, i) =>
    (checkedQuery((2 ** i) >>> 0) ^ constant) >>> 0);
  /** @type {number[][]} */
  const quadratic = Array.from({length: bits}, () => Array(bits).fill(0));
  for (let i = 0; i < bits; i++) {
    for (let j = i + 1; j < bits; j++) {
      quadratic[i][j] = (checkedQuery(((2 ** i) ^ (2 ** j)) >>> 0) ^
        constant ^ linear[i] ^ linear[j]) >>> 0;
    }
  }
  return {bits, constant, linear, quadratic, queryCount: 1 + bits + bits * (bits - 1) / 2};
}

/**
 * Execute the reconstructed model locally. No reference to the original
 * server, input oracle, or original implementation is retained.
 * @param {QuadraticModel} model
 * @param {number} input
 * @returns {number}
 */
function evaluateQuadraticModel(model, input) {
  let result = model.constant;
  for (let i = 0; i < model.bits; i++) {
    if (!((input >>> i) & 1)) continue;
    result ^= model.linear[i];
    for (let j = i + 1; j < model.bits; j++) {
      if ((input >>> j) & 1) result ^= model.quadratic[i][j];
    }
  }
  return result >>> 0;
}

module.exports = {learnQuadraticOracle, evaluateQuadraticModel};
