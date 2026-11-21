'use strict';

const assert = require('node:assert/strict');

/** @typedef {(input:number)=>number} UIntOracle */
/** @typedef {{bits:number,maxCodimension?:number,maxQueries?:number}} Options */
/** @typedef {{preimage:number,queryCount:number,interpolationCalls:number,quadraticCalls:number,radicalDimension:number,codimension:number,cosetCalls:number,verificationCalls:number}} InversionResult */

/**
 * Linear map on unsigned GF(2) bit vectors, represented by columns.
 * @param {number[]} columns
 * @param {number} input
 * @returns {number}
 */
function linear(columns, input) {
  let out = 0;
  for (let i = 0; i < columns.length; i++) {
    if ((input >>> i) & 1) out = (out ^ columns[i]) >>> 0;
  }
  return out;
}

/**
 * Return a GF(2) basis without discarding the original input vectors.
 * @param {number[]} vectors
 * @param {number} bits
 * @returns {number[]}
 */
function basis(vectors, bits) {
  const pivots = Array(bits).fill(0);
  /** @type {number[]} */
  const independent = [];
  for (const original of vectors) {
    let v = original >>> 0;
    for (let bit = bits - 1; bit >= 0 && v; bit--) {
      if (!((v >>> bit) & 1)) continue;
      if (pivots[bit]) v = (v ^ pivots[bit]) >>> 0;
      else {
        pivots[bit] = v;
        independent.push(original >>> 0);
        break;
      }
    }
  }
  return independent;
}

/**
 * Derive the common radical of the vector-valued bilinear polar form.
 * A column packs B(e_i,e_j) for all j, in 32-bit output lanes of a bigint.
 * @param {number[][]} polar
 * @param {number} bits
 * @returns {number[]}
 */
function radical(polar, bits) {
  /** @type {Map<number,{vector:bigint,source:number}>} */
  const pivots = new Map();
  /** @type {number[]} */
  const kernel = [];
  for (let i = 0; i < bits; i++) {
    let packed = 0n;
    for (let j = 0; j < bits; j++) {
      packed ^= BigInt(polar[i][j]) << (32n * BigInt(j));
    }
    let source = (2 ** i) >>> 0;
    while (packed !== 0n) {
      const position = packed.toString(2).length - 1;
      const old = pivots.get(position);
      if (!old) {
        pivots.set(position, {vector: packed, source});
        break;
      }
      packed ^= old.vector;
      source = (source ^ old.source) >>> 0;
    }
    if (packed === 0n) kernel.push(source);
  }
  assert.equal(basis(kernel, bits).length, kernel.length);
  return kernel;
}

/**
 * Construct an exact inverse from a promised deterministic quadratic
 * permutation F of n-bit unsigned words. In this restricted grammar,
 * all coordinate algebraic normal forms have degree at most two.
 *
 * The polar form B(u,v)=F(0)^F(u)^F(v)^F(u^v) is then bilinear. Its
 * common radical U is derived from basis pairs. For u in U:
 *   F(x^u)=F(x)^F(u)^F(0).
 * Thus F is affine on each U coset. Scan at most 2^codimension cosets,
 * then solve the linear map from U to its image to recover the target.
 *
 * The quadratic-permutation premise is essential and cannot be proved
 * from fewer than a full truth table for arbitrary black-box functions.
 * The supplied caller must establish that premise independently.
 *
 * @param {UIntOracle} oracle
 * @param {number} target
 * @param {Options} options
 * @returns {InversionResult}
 */
function invertQuadraticPermutation(oracle, target, options) {
  const bits = options.bits;
  if (!Number.isInteger(bits) || bits < 1 || bits > 32) {
    throw new RangeError('Expected 1..32 bits');
  }
  const range = 2 ** bits;
  if (!Number.isInteger(target) || target < 0 || target >= range) {
    throw new RangeError('Target outside n-bit domain');
  }
  const maxCodimension = options.maxCodimension ?? Math.min(bits, 12);
  const maxQueries = options.maxQueries ?? (1 + bits + bits * (bits - 1) / 2 + bits + 2 ** maxCodimension + 1);
  if (!Number.isInteger(maxCodimension) || maxCodimension < 0 || maxCodimension > Math.min(bits, 16) ||
      !Number.isInteger(maxQueries) || maxQueries < 1) {
    throw new RangeError('Invalid finite query or quotient dimension cap');
  }
  /** @type {Map<number,number>} */
  const responses = new Map();
  /** @param {number} input @returns {number} */
  function query(input) {
    const old = responses.get(input);
    if (old !== undefined) return old;
    if (responses.size >= maxQueries) throw new RangeError('Oracle query cap reached');
    const out = oracle(input);
    if (!Number.isInteger(out) || out < 0 || out >= range) {
      throw new TypeError('Oracle must return unsigned n-bit integer');
    }
    responses.set(input, out >>> 0);
    return out >>> 0;
  }

  const constant = query(0);
  const unitImages = Array.from({length: bits}, (_, i) => query((2 ** i) >>> 0));
  const columns = unitImages.map(y => (y ^ constant) >>> 0);
  /** @type {number[][]} */
  const polar = Array.from({length: bits}, () => Array(bits).fill(0));
  for (let i = 0; i < bits; i++) {
    for (let j = i + 1; j < bits; j++) {
      const p = (query(((2 ** i) ^ (2 ** j)) >>> 0) ^ unitImages[i] ^ unitImages[j] ^ constant) >>> 0;
      polar[i][j] = p;
      polar[j][i] = p;
    }
  }
  const afterQuadratic = responses.size;
  const uBasis = radical(polar, bits);
  let inputBasis = uBasis.slice();
  /** @type {number[]} */
  const complement = [];
  for (let i = 0; i < bits; i++) {
    const e = (2 ** i) >>> 0;
    if (basis([...inputBasis, e], bits).length > inputBasis.length) {
      complement.push(e);
      inputBasis.push(e);
    }
  }
  assert.equal(inputBasis.length, bits);
  const codimension = complement.length;
  if (codimension > maxCodimension) throw new RangeError('Quadratic radical codimension exceeds cap');

  const outputPivots = Array(bits).fill(0);
  const sourcePivots = Array(bits).fill(0);
  for (const u of uBasis) {
    let y = (query(u) ^ constant) >>> 0;
    let source = u;
    let placed = false;
    for (let bit = bits - 1; bit >= 0 && y; bit--) {
      if (!((y >>> bit) & 1)) continue;
      if (outputPivots[bit]) {
        y = (y ^ outputPivots[bit]) >>> 0;
        source = (source ^ sourcePivots[bit]) >>> 0;
      } else {
        outputPivots[bit] = y;
        sourcePivots[bit] = source;
        placed = true;
        break;
      }
    }
    if (!placed) throw new TypeError('Oracle violates promised permutation');
  }

  /** @param {number} delta @returns {number|null} */
  function solve(delta) {
    let y = delta >>> 0;
    let source = 0;
    for (let bit = bits - 1; bit >= 0 && y; bit--) {
      if (!((y >>> bit) & 1)) continue;
      if (!outputPivots[bit]) return null;
      y = (y ^ outputPivots[bit]) >>> 0;
      source = (source ^ sourcePivots[bit]) >>> 0;
    }
    return y === 0 ? source : null;
  }

  const beforeCosets = responses.size;
  for (let i = 0; i < 2 ** codimension; i++) {
    const x = linear(complement, i);
    const delta = (target ^ query(x)) >>> 0;
    const u = solve(delta);
    if (u === null) continue;
    const answer = (x ^ u) >>> 0;
    const beforeVerify = responses.size;
    if (query(answer) === target) {
      return {
        preimage: answer,
        queryCount: responses.size,
        interpolationCalls: 1 + bits,
        quadraticCalls: afterQuadratic - 1 - bits,
        radicalDimension: uBasis.length,
        codimension,
        cosetCalls: beforeVerify - beforeCosets,
        verificationCalls: responses.size - beforeVerify
      };
    }
    throw new TypeError('Oracle violates promised quadratic structure');
  }
  throw new TypeError('Oracle violates promised quadratic permutation');
}

module.exports = {invertQuadraticPermutation, linear, basis, radical};
