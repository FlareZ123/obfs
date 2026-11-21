'use strict';

const assert = require('node:assert/strict');
const {invertQuadraticPermutation, linear, basis} = require('./quadratic-radical-target-inversion');

/** @param {number} seed @returns {()=>number} */
function seeded(seed) {
  let state = (seed >>> 0) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
}

/** @param {number} bits @param {()=>number} next @returns {number[]} */
function invertible(bits, next) {
  const columns = Array.from({length: bits}, (_, i) => (2 ** i) >>> 0);
  for (let step = 0; step < 16 * bits; step++) {
    const a = next() % bits;
    const b = (a + 1 + next() % (bits - 1)) % bits;
    columns[a] = (columns[a] ^ columns[b]) >>> 0;
  }
  assert.equal(basis(columns, bits).length, bits);
  return columns;
}

/** @param {number[]} values @returns {Generator<number[]>} */
function* permutations(values) {
  if (!values.length) {
    yield [];
    return;
  }
  for (let i = 0; i < values.length; i++) {
    for (const rest of permutations([...values.slice(0, i), ...values.slice(i + 1)])) {
      yield [values[i], ...rest];
    }
  }
}

/** @param {number[]} outputs @param {number} bits @returns {boolean} */
function isQuadratic(outputs, bits) {
  const coefficients = outputs.slice();
  for (let bit = 0; bit < bits; bit++) {
    for (let mask = 0; mask < 2 ** bits; mask++) {
      if ((mask >>> bit) & 1) coefficients[mask] ^= coefficients[mask ^ (2 ** bit)];
    }
  }
  /** @param {number} mask @returns {number} */
  const degree = mask => {
    let n = 0;
    while (mask) {
      mask &= mask - 1;
      n++;
    }
    return n;
  };
  return coefficients.every((value, i) => value === 0 || degree(i) <= 2);
}

/** @returns {number[][]} */
function pairs8() {
  /** @type {number[][]} */
  const pairs = [];
  for (let i = 0; i < 8; i++) {
    for (let j = i + 1; j < 8; j++) pairs.push([i, j]);
  }
  assert.equal(pairs.length, 28);
  return pairs.slice(0, 24);
}

const pairs = pairs8();

/**
 * Quadratic triangular permutation with exactly 24 nonlinear output
 * directions, then independently hidden input/output invertible maps.
 * The 24 nonlinear forms x_i*x_j are linearly independent and their
 * 24 output bits are distinct. It has a 24-dimensional affine input
 * translation radical and output nonlinear residual span of dimension 24.
 * @param {number} seed
 * @returns {(input:number)=>number}
 */
function hidden32(seed) {
  const next = seeded(seed);
  const incoming = invertible(32, next);
  const outgoing = invertible(32, next);
  const offset = next();
  return x => {
    const mapped = linear(incoming, x);
    let mask = 0;
    for (let k = 0; k < pairs.length; k++) {
      const [i, j] = pairs[k];
      if (((mapped >>> i) & 1) && ((mapped >>> j) & 1)) mask = (mask ^ (2 ** k)) >>> 0;
    }
    const changed = (mapped ^ ((mask << 8) >>> 0)) >>> 0;
    return (linear(outgoing, changed) ^ offset) >>> 0;
  };
}

function main() {
  const summary = {
    width3Permutations: 0, width3Targets: 0, width3MaxQueries: 0,
    width3CodimDistribution: [0, 0, 0, 0],
    width4Targets: 0, highRank32Targets: 0,
    width32MinQueries: 1e9, width32MaxQueries: 0,
    width32RadicalDimension: 24, width32NonlinearOutputRank: 24
  };
  let count = 0;
  for (const perm of permutations([0, 1, 2, 3, 4, 5, 6, 7])) {
    assert.ok(isQuadratic(perm, 3), 'every 3-bit permutation has degree <=2');
    for (let input = 0; input < 8; input++) {
      const target = perm[input];
      const result = invertQuadraticPermutation(x => perm[x], target, {bits: 3});
      assert.equal(result.preimage, input);
      assert.equal(perm[result.preimage], target);
      assert.ok(result.queryCount <= 8);
      assert.equal(result.radicalDimension + result.codimension, 3);
      if (input === 0) summary.width3CodimDistribution[result.codimension]++;
      summary.width3MaxQueries = Math.max(summary.width3MaxQueries, result.queryCount);
      summary.width3Targets++;
    }
    count++;
  }
  summary.width3Permutations = count;
  assert.equal(summary.width3Targets, 322560);

  const random = seeded(0x41e23578);
  for (let instance = 0; instance < 100; instance++) {
    const left = invertible(4, random);
    const right = invertible(4, random);
    const offset = random() & 15;
    /** @param {number} x @returns {number} */
    const oracle = x => {
      const y = linear(left, x);
      const mixed = y ^ ((((y >>> 0) & 1) && ((y >>> 1) & 1)) ? 8 : 0);
      return (linear(right, mixed) ^ offset) & 15;
    };
    const outputs = Array.from({length: 16}, (_, x) => oracle(x));
    assert.ok(isQuadratic(outputs, 4));
    assert.equal(new Set(outputs).size, 16);
    for (let input = 0; input < 16; input++) {
      const v = invertQuadraticPermutation(oracle, oracle(input), {bits: 4});
      assert.equal(v.preimage, input);
      summary.width4Targets++;
    }
  }
  for (let instance = 0; instance < 10; instance++) {
    const oracle = hidden32(random());
    for (let k = 0; k < 8; k++) {
      const input = random();
      const v = invertQuadraticPermutation(oracle, oracle(input), {
        bits: 32, maxCodimension: 8, maxQueries: 900
      });
      assert.equal(v.preimage, input);
      assert.equal(v.radicalDimension, 24);
      assert.equal(v.codimension, 8);
      assert.ok(v.queryCount <= 900);
      summary.width32MinQueries = Math.min(summary.width32MinQueries, v.queryCount);
      summary.width32MaxQueries = Math.max(summary.width32MaxQueries, v.queryCount);
      summary.highRank32Targets++;
    }
  }
  assert.equal(summary.width4Targets, 1600);
  assert.equal(summary.highRank32Targets, 80);
  // A degree-three triangular bijection does not satisfy the theorem:
  // demonstrate a nonzero finite third derivative as an explicit negative.
  /** @param {number} x @returns {number} */
  const cubic = x => x ^ (((x & 1) && (x & 2) && (x & 4)) ? 8 : 0);
  const third = [0,1,2,3,4,5,6,7].reduce((sum,x) => sum ^ cubic(x),0);
  assert.equal(third, 8);
  process.stdout.write(JSON.stringify({...summary, cubicThirdDerivative: third}) + '\n');
}

if (require.main === module) main();
module.exports = {hidden32, isQuadratic};
