'use strict';

const assert = require('node:assert/strict');
const {learnBoundedDegreeOracle, evaluateBoundedDegreeModel} =
  require('./bounded-degree-oracle-functional-clone');

/** @param {number} seed @returns {()=>number} */
function rng(seed) {
  let x = (seed >>> 0) || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return x >>> 0;
  };
}

/** @param {number[]} columns @param {number} x @returns {number} */
function linear(columns, x) {
  let result = 0;
  for (let bit = 0; bit < columns.length; bit++) {
    if ((x >>> bit) & 1) result = (result ^ columns[bit]) >>> 0;
  }
  return result;
}

/** @param {number} bits @param {()=>number} next @returns {number[]} */
function invertible(bits, next) {
  const columns = Array.from({length: bits}, (_, i) => (2 ** i) >>> 0);
  for (let step = 0; step < 16 * bits; step++) {
    const i = next() % bits;
    const j = (i + 1 + next() % (bits - 1)) % bits;
    columns[i] = (columns[i] ^ columns[j]) >>> 0;
  }
  return columns;
}

/** @param {number} a @param {number} b @returns {number} */
function gf9Multiply(a, b) {
  let out = 0;
  for (let bit = 0; bit < 9; bit++) {
    if (b & 1) out ^= a;
    b >>>= 1;
    a <<= 1;
    if (a & 512) a ^= 0x211;
  }
  return out & 511;
}

/** @param {number} x @returns {number} */
function cubeGF9(x) {
  return gf9Multiply(gf9Multiply(x, x), x);
}

/** @param {number[]} vectors @param {number} bits @returns {number} */
function rank(vectors, bits) {
  const pivots = Array(bits).fill(0);
  let count = 0;
  for (const original of vectors) {
    let v = original >>> 0;
    for (let bit = bits - 1; bit >= 0 && v; bit--) {
      if (!((v >>> bit) & 1)) continue;
      if (pivots[bit]) v = (v ^ pivots[bit]) >>> 0;
      else {
        pivots[bit] = v;
        count++;
        break;
      }
    }
  }
  return count;
}

/** @returns {Array<[number,number]>} */
function selectPairs() {
  /** @type {Array<[number,number]>} */
  const all = [];
  /** @type {number[]} */
  const lowerPolar = [];
  /** @type {Set<number>} */
  const reserved = new Set();
  for (let i = 0; i < 9; i++) {
    for (let j = i + 1; j < 9; j++) {
      all.push([i, j]);
      const p = cubeGF9((2 ** i) ^ (2 ** j)) ^ cubeGF9(2 ** i) ^ cubeGF9(2 ** j);
      if (rank([...lowerPolar, p], 9) > lowerPolar.length) {
        lowerPolar.push(p);
        reserved.add(i * 9 + j);
      }
    }
  }
  assert.equal(lowerPolar.length, 9);
  return all.filter(([i,j]) => !reserved.has(i * 9 + j)).slice(0, 23);
}

const quadraticPairs = selectPairs();

/**
 * Affine-wrapped permutation with exact global ANF degree 3 or 4.
 * The nine control outputs are a quadratic GF(2^9) field cube;
 * 23 upper output bits are XORed with independent quadratic monomials
 * plus either a cubic or a quartic control monomial.
 * @param {number} seed
 * @param {3|4} degree
 * @returns {(x:number)=>number}
 */
function hiddenDegree32(seed, degree) {
  const next = rng(seed);
  const incoming = invertible(32, next);
  const outgoing = invertible(32, next);
  const offset = next();
  return x => {
    const mapped = linear(incoming, x);
    const low = mapped & 511;
    let highMask = 0;
    for (let j = 0; j < quadraticPairs.length; j++) {
      const [a,b] = quadraticPairs[j];
      if (((low >>> a) & 1) && ((low >>> b) & 1)) highMask ^= 2 ** j;
    }
    if ((low & 7) === 7) highMask ^= 1;
    if (degree === 4 && (low & 15) === 15) highMask ^= 2;
    const high = (mapped >>> 9) ^ highMask;
    const mixed = (cubeGF9(low) | (high << 9)) >>> 0;
    return (linear(outgoing, mixed) ^ offset) >>> 0;
  };
}

/** @param {number} x @returns {number} */
function countBits(x) {
  let count = 0;
  while (x) {
    x &= x - 1;
    count++;
  }
  return count;
}

/**
 * Independent finite-dimensional information lower-bound control.
 * For 128 seeded distinct 15-query transcripts on a 5-bit domain,
 * construct a nonzero degree<=2 polynomial that vanishes on every
 * queried input by finding a nontrivial kernel of its 15x16 evaluation
 * matrix. Such a polynomial is indistinguishable from zero until an
 * unqueried input is tested.
 * @returns {number}
 */
function lowerBoundCollisions() {
  /** @type {number[]} */
  const monomials = [0];
  for (let i = 0; i < 5; i++) monomials.push(2 ** i);
  for (let i = 0; i < 5; i++) {
    for (let j = i + 1; j < 5; j++) monomials.push((2 ** i) ^ (2 ** j));
  }
  assert.equal(monomials.length, 16);
  const next = rng(0x59a32f1e);
  let collisions = 0;
  for (let attempt = 0; attempt < 128; attempt++) {
    const order = Array.from({length: 32}, (_,i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = next() % (i + 1);
      [order[i], order[j]] = [order[j], order[i]];
    }
    const visited = order.slice(0, 15);
    const rows = visited.map(x => monomials.reduce((mask, m, index) =>
      mask | (((x & m) === m ? 1 : 0) << index), 0));
    /** @type {number[]} */
    const pivotColumns = [];
    let rank = 0;
    for (let c = 0; c < 16; c++) {
      const selected = rows.findIndex((r,i) => i >= rank && ((r >>> c) & 1));
      if (selected === -1) continue;
      [rows[rank], rows[selected]] = [rows[selected], rows[rank]];
      for (let i = 0; i < rows.length; i++) {
        if (i !== rank && ((rows[i] >>> c) & 1)) rows[i] ^= rows[rank];
      }
      pivotColumns.push(c);
      rank++;
    }
    const free = Array.from({length: 16}, (_,i) => i)
      .find(c => !pivotColumns.includes(c));
    assert.notEqual(free, undefined);
    /** @type {number} */
    const freeColumn = /** @type {number} */ (free);
    let coefficients = 1 << freeColumn;
    /** @param {number} mask @returns {number} */
    function parity(mask) {
      let x = mask;
      x ^= x >>> 8;
      x ^= x >>> 4;
      x ^= x >>> 2;
      x ^= x >>> 1;
      return x & 1;
    }
    for (let i = pivotColumns.length - 1; i >= 0; i--) {
      if (parity(rows[i] & coefficients)) coefficients |= 1 << pivotColumns[i];
    }
    /** @param {number} input @returns {number} */
    function polynomial(input) {
      let out = 0;
      for (let i = 0; i < monomials.length; i++) {
        if (((coefficients >>> i) & 1) && (input & monomials[i]) === monomials[i]) out ^= 1;
      }
      return out;
    }
    assert.ok(visited.every(x => polynomial(x) === 0));
    assert.ok(Array.from({length: 32}, (_,x) => x).some(x => polynomial(x) !== 0));
    collisions++;
  }
  return collisions;
}

function main() {
  const next = rng(0x775390e1);
  const report = {
    bits: 32, cubicTrainingQueries: 5489, quarticTrainingQueries: 41449,
    cubicInstances: 0, quarticInstances: 0,
    cubicHeldoutOutputs: 0, quarticHeldoutOutputs: 0,
    cubicResidualRank: 32, quarticResidualRank: 32,
    spoofDegree4Queries: 163, spoofHiddenMismatches: 0,
    adaptiveTranscriptCollisions: 0
  };
  for (const degree of /** @type {const} */([3,4])) {
    for (let instance = 0; instance < 2; instance++) {
      const oracle = hiddenDegree32(next(), degree);
      let live = true;
      let serverCalls = 0;
      const model = learnBoundedDegreeOracle(x => {
        if (!live) throw new Error('Offline clone unexpectedly called the server');
        serverCalls++;
        return oracle(x);
      }, 32, degree);
      const expected = degree === 3 ? 5489 : 41449;
      assert.equal(model.queryCount, expected);
      assert.equal(serverCalls, expected);
      const published = JSON.parse(JSON.stringify(model));
      /** @type {Array<[number,number]>} */
      const coefficients = published.coefficients;
      assert.ok(coefficients.some(([mask,value]) => countBits(mask) === degree && value !== 0));
      assert.equal(rank(coefficients.filter(([mask]) => countBits(mask) >= 2)
        .map(([,value]) => value), 32), 32);
      live = false;
      const heldout = degree === 3 ? 256 : 128;
      for (let k = 0; k < heldout; k++) {
        const x = next();
        assert.equal(evaluateBoundedDegreeModel(published, x), oracle(x));
        if (degree === 3) report.cubicHeldoutOutputs++;
        else report.quarticHeldoutOutputs++;
      }
      assert.equal(serverCalls, expected);
      if (degree === 3) report.cubicInstances++;
      else report.quarticInstances++;
    }
  }
  const identity = learnBoundedDegreeOracle(x => x, 8, 4);
  const modified = learnBoundedDegreeOracle(x => x === 31 ? 47 : x === 47 ? 31 : x, 8, 4);
  assert.equal(identity.queryCount, 163);
  assert.deepEqual(identity, modified);
  for (let x = 0; x < 256; x++) {
    const real = x === 31 ? 47 : x === 47 ? 31 : x;
    if (evaluateBoundedDegreeModel(modified, x) !== real) report.spoofHiddenMismatches++;
  }
  assert.equal(report.spoofHiddenMismatches, 2);
  report.adaptiveTranscriptCollisions = lowerBoundCollisions();
  assert.equal(report.adaptiveTranscriptCollisions, 128);
  assert.equal(report.cubicHeldoutOutputs, 512);
  assert.equal(report.quarticHeldoutOutputs, 256);
  process.stdout.write(JSON.stringify(report) + '\n');
}

if (require.main === module) main();
module.exports = {hiddenDegree32, main};
