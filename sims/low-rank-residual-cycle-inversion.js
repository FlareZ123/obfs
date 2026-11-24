'use strict';

const assert = require('node:assert/strict');

/** @typedef {()=>number} Random */
/** @typedef {(x:number)=>number} Permutation */

/** @param {number} seed @returns {Random} */
function random(seed) {
  let state = seed >>> 0 || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
}

/** @param {number} n @returns {number} */
function widthMask(n) {
  return n === 32 ? 0xffffffff : (2 ** n - 1) >>> 0;
}

/**
 * Apply an n x n binary matrix represented by its n output columns.
 * @param {number[]} columns
 * @param {number} x
 * @returns {number}
 */
function apply(columns, x) {
  let output = 0;
  for (let bit = 0; bit < columns.length; bit++) {
    if ((x >>> bit) & 1) output ^= columns[bit];
  }
  return output >>> 0;
}

/**
 * Row-reduce the augmented binary matrix [M|I]. Returns inverse columns
 * or null when the sampled affine interpolant is singular.
 * @param {number[]} columns
 * @returns {number[]|null}
 */
function invert(columns) {
  const n = columns.length;
  /** @type {number[]} */
  const rows = Array.from({length:n}, (_, row) => {
    let bits = 0;
    for (let col = 0; col < n; col++) {
      if ((columns[col] >>> row) & 1) bits ^= 1 << col;
    }
    return bits >>> 0;
  });
  const right = Array.from({length:n}, (_, row) => (1 << row) >>> 0);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    while (pivot < n && !((rows[pivot] >>> col) & 1)) pivot++;
    if (pivot === n) return null;
    [rows[pivot], rows[col]] = [rows[col], rows[pivot]];
    [right[pivot], right[col]] = [right[col], right[pivot]];
    for (let row = 0; row < n; row++) {
      if (row === col || !((rows[row] >>> col) & 1)) continue;
      rows[row] = (rows[row] ^ rows[col]) >>> 0;
      right[row] = (right[row] ^ right[col]) >>> 0;
    }
  }
  return Array.from({length:n}, (_, col) => {
    let bits = 0;
    for (let row = 0; row < n; row++) {
      if ((right[row] >>> col) & 1) bits ^= 1 << row;
    }
    return bits >>> 0;
  });
}

/**
 * Generate an invertible matrix by elementary output-row operations.
 * @param {number} n
 * @param {Random} rng
 * @returns {number[]}
 */
function randomInvertible(n, rng) {
  const columns = Array.from({length:n}, (_, i) => (1 << i) >>> 0);
  for (let trial = 0; trial < 16 * n; trial++) {
    const source = rng() % n;
    const target = (source + 1 + rng() % (n - 1)) % n;
    const mask = (1 << target) >>> 0;
    for (let col = 0; col < n; col++) {
      if ((columns[col] >>> source) & 1) columns[col] = (columns[col] ^ mask) >>> 0;
    }
  }
  return columns;
}

/**
 * Arbitrary-looking finite Boolean rank-r mask with no full truth table.
 * Its input excludes the highest r bits, so toggling only those
 * bits is an exact permutation independently of the hash complexity.
 * @param {number} x
 * @param {number} seed
 * @param {number} r
 * @returns {number}
 */
function maskFunction(x, seed, r) {
  let value = (x ^ seed) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d) >>> 0;
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b) >>> 0;
  value ^= value >>> 16;
  return value & ((1 << r) - 1);
}

/**
 * Hidden two-sided affine rank-r shear permutation.
 * @param {number} n
 * @param {number} r
 * @param {number} seed
 * @returns {Permutation}
 */
function hiddenShear(n, r, seed) {
  const rng = random(seed);
  const input = randomInvertible(n, rng);
  const output = randomInvertible(n, rng);
  const inOffset = rng() & widthMask(n);
  const outOffset = rng() & widthMask(n);
  const lowBits = n - r;
  const lowMask = widthMask(lowBits);
  const salt = rng();
  return value => {
    const inner = (apply(input, value) ^ inOffset) >>> 0;
    const toggle = r ? (maskFunction(inner & lowMask, salt, r) << lowBits) >>> 0 : 0;
    return ((apply(output, inner ^ toggle) ^ outOffset) & widthMask(n)) >>> 0;
  };
}

/**
 * A broader hidden rank-r family: each fixed lower-bit input fiber uses
 * an independent full permutation of the upper r bits. The permutation
 * may depend on both its low-bit fiber and the original upper input.
 * @param {number} n
 * @param {number} r
 * @param {number} seed
 * @returns {Permutation}
 */
function hiddenFiberPermutation(n, r, seed) {
  const rng = random(seed);
  const input = randomInvertible(n, rng);
  const output = randomInvertible(n, rng);
  const inOffset = rng() & widthMask(n);
  const outOffset = rng() & widthMask(n);
  const lowBits = n-r;
  const lowMask = widthMask(lowBits);
  const highMask = 2 ** r-1;
  const salt = rng();
  return x => {
    const inner = (apply(input,x) ^ inOffset) >>> 0;
    const low = inner & lowMask;
    const high = inner >>> lowBits;
    const choose = random((Math.imul(low ^ salt,0x9e3779b1) ^ salt) >>> 0);
    const positions = Array.from({length:2 ** r},(_,i)=>i);
    for (let j = positions.length-1; j>0; j--) {
      const k = choose()%(j+1);
      [positions[k],positions[j]] = [positions[j],positions[k]];
    }
    const mapped = (low | ((positions[high & highMask] << lowBits) >>> 0)) >>> 0;
    return ((apply(output,mapped)^outOffset)&widthMask(n))>>>0;
  };
}

/**
 * Invert y=F(secret) using only an F oracle and an upper bound r, provided
 * the affine interpolant determined by F(0),F(e_i) is invertible.
 * A residual output subspace W of dimension <=r exists; its basis and the
 * original affine transforms are unknown to the attacker.
 *
 * @param {number} n
 * @param {number} r
 * @param {Permutation} oracle
 * @param {number} target
 * @returns {{secret:number,queries:number,cycleSteps:number}|null}
 */
function inverseWithFullRankInterpolation(n, r, oracle, target) {
  /** @type {Map<number,number>} */
  const calls = new Map();
  /** @param {number} x @returns {number} */
  const query = x => {
    const key = x >>> 0;
    if (!calls.has(key)) calls.set(key, oracle(key));
    return /** @type {number} */ (calls.get(key));
  };
  const c = query(0);
  const columns = Array.from({length:n}, (_, i) => (query((1 << i) >>> 0) ^ c) >>> 0);
  const inverse = invert(columns);
  if (!inverse) return null;
  const z = apply(inverse, (target ^ c) >>> 0);
  let point = z;
  const size = 2 ** r;
  for (let step = 0; step < size - 1; step++) {
    const next = apply(inverse, (query(point) ^ c) >>> 0);
    if (next === z) return {secret:point, queries:calls.size,cycleSteps:step+1};
    point = next;
  }
  return {secret:point,queries:calls.size,cycleSteps:size-1};
}

/**
 * Invert y=F(secret) with a full-rank sampled affine interpolant without
 * knowing the global residual rank. Follow the induced permutation cycle
 * until it closes; the actual residual rank bounds its length by 2^r.
 *
 * @param {number} n
 * @param {Permutation} oracle
 * @param {number} target
 * @returns {{secret:number,queries:number,cycleSteps:number}|null}
 */
function inverseWithoutRankBound(n, oracle, target) {
  /** @type {Map<number,number>} */
  const calls = new Map();
  /** @param {number} x @returns {number} */
  const query = x => {
    const key = x >>> 0;
    if (!calls.has(key)) calls.set(key, oracle(key));
    return /** @type {number} */ (calls.get(key));
  };
  const c = query(0);
  const columns = Array.from({length:n}, (_, i) =>
    (query((1 << i) >>> 0) ^ c) >>> 0);
  const inverse = invert(columns);
  if (!inverse) return null;
  const z = apply(inverse, (target ^ c) >>> 0);
  let point = z;
  let cycleSteps = 0;
  const visited = new Set([z]);
  for (;;) {
    const next = apply(inverse, (query(point) ^ c) >>> 0);
    cycleSteps++;
    if (next === z)
      return {secret:point,queries:calls.size,cycleSteps};
    // Under the permutation promise, the orbit of z cannot enter a
    // different cycle. This guard prevents an invalid oracle from looping.
    if (visited.has(next)) return null;
    visited.add(next);
    point = next;
  }
}

/** @returns {void} */
function main() {
  /** @type {Array<{
   * family:string,n:number,r:number,cases:number,nonsingular:number,
   * singular:number,recovered:number,maxQueries:number,
   * theoremBound:number,maxCycleSteps:number}>} */
  const summary = [];
  for (const family of ['shear','fiber-permutation']) {
    for (const n of [8,16,32]) {
      for (const r of [0,1,2,3]) {
        const cases = 192;
        let nonsingular = 0;
        let singular = 0;
        let recovered = 0;
        let maxQueries = 0;
        let maxCycleSteps = 0;
        for (let iteration = 0; iteration < cases; iteration++) {
          const seed = (Math.imul(iteration + 1, 0x9e3779b1) ^
            Math.imul(n * 17 + r * 131, 0x85ebca6b)) >>> 0;
          const F = family==='shear' ? hiddenShear(n,r,seed) : hiddenFiberPermutation(n,r,seed);
          if (n === 8) {
            const observed = new Set();
            for (let x = 0; x < 256; x++) observed.add(F(x));
            assert.equal(observed.size,256,'Constructed map must be a permutation');
          }
          const rng = random(seed ^ 0x1b873593);
          const secrets = Array.from({length:4}, () => (rng() & widthMask(n)) >>> 0);
          const sample = inverseWithFullRankInterpolation(n,r,F,F(secrets[0]));
          if (!sample) {singular++;continue;}
          nonsingular++;
          for (const secret of secrets) {
            const solved = inverseWithFullRankInterpolation(n,r,F,F(secret));
            assert.ok(solved);
            assert.equal(solved.secret,secret,
              'Full-rank rank-r inversion failed seed='+seed+' n='+n+' r='+r);
            assert.ok(solved.queries <= n+2**r,
              'Bound exceeded at seed='+seed+' n='+n+' r='+r);
            recovered++;
            maxQueries = Math.max(maxQueries,solved.queries);
            maxCycleSteps = Math.max(maxCycleSteps,solved.cycleSteps);
          }
        }
        assert.ok(nonsingular,'Expected at least one full-rank interpolant');
        summary.push({family,n,r,cases,nonsingular,singular,recovered,
          maxQueries,theoremBound:n+2**r,maxCycleSteps});
      }
    }
  }
  console.log(JSON.stringify(summary,null,2));
}

if (require.main === module) main();
module.exports = {random,apply,invert,randomInvertible,hiddenShear,hiddenFiberPermutation,
  inverseWithFullRankInterpolation,inverseWithoutRankBound,main};
