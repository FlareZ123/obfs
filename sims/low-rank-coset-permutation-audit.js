'use strict';

const assert = require('node:assert/strict');

/** @param {number} seed */
function random(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
}

/** @param {number[]} columns @param {number} x */
function linear(columns, x) {
  let y = 0;
  for (let i = 0; i < columns.length; ++i) if ((x >>> i) & 1) y ^= columns[i];
  return y;
}

/** @param {number[]} columns */
function rank(columns) {
  const pivots = new Array(8).fill(0);
  let count = 0;
  for (let col of columns) {
    for (let bit = 7; bit >= 0; --bit) {
      if (!(col & (1 << bit))) continue;
      if (pivots[bit]) col ^= pivots[bit];
      else {
        pivots[bit] = col;
        ++count;
        break;
      }
    }
  }
  return count;
}

/** @param {()=>number} rng */
function randomInvertible(rng) {
  const columns = Array.from({length: 8}, (_, i) => 1 << i);
  for (let i = 0; i < 96; ++i) {
    const a = rng() & 7;
    let b = rng() & 7;
    if (b === a) b = (b + 1) & 7;
    if (rng() & 1) [columns[a], columns[b]] = [columns[b], columns[a]];
    else columns[a] ^= columns[b];
  }
  assert.equal(rank(columns), 8);
  return columns;
}

/** @param {()=>number} rng @param {number} length */
function permutation(rng, length) {
  const items = Array.from({length}, (_, i) => i);
  for (let i = length - 1; i > 0; --i) {
    const j = rng() % (i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/** @param {number[]} sampledColumns */
function repair(sampledColumns) {
  /** @type {number[]} */
  const independent = [];
  const kept = new Set();
  for (let i = 0; i < sampledColumns.length; ++i) {
    if (rank([...independent, sampledColumns[i]]) > independent.length) {
      kept.add(i);
      independent.push(sampledColumns[i]);
    }
  }
  const repaired = sampledColumns.slice();
  for (let i = 0; i < repaired.length; ++i) {
    if (kept.has(i)) continue;
    const substitute = Array.from({length: 8}, (_, bit) => 1 << bit)
      .find(unit => rank([...independent, unit]) > independent.length);
    if (substitute === undefined) throw new Error('No rank-completing unit');
    independent.push(substitute);
    repaired[i] = substitute;
  }
  assert.equal(rank(repaired), 8);
  const replacements = 8 - rank(sampledColumns);
  assert.equal(8 - kept.size, replacements);
  return {columns: repaired, replacements};
}

/** @param {number[]} columns */
function inverseTable(columns) {
  const inverse = new Int16Array(256).fill(-1);
  for (let x = 0; x < 256; ++x) {
    const y = linear(columns, x);
    assert.equal(inverse[y], -1);
    inverse[y] = x;
  }
  return inverse;
}

/**
 * @param {(x:number)=>number} f
 * @param {number} target
 * @param {number} r
 */
function invertViaOrbit(f, target, r) {
  const cache = new Map();
  /** @param {number} x */
  function oracle(x) {
    if (!cache.has(x)) cache.set(x, f(x));
    return cache.get(x);
  }
  const c = oracle(0);
  const M = Array.from({length: 8}, (_, i) => oracle(1 << i) ^ c);
  const {columns: T, replacements: d} = repair(M);
  const inverse = inverseTable(T);
  const z = inverse[target ^ c];
  const bound = 1 << Math.min(8, r + d);
  let x = z;
  let source = -1;
  let steps = 0;
  do {
    source = x;
    x = inverse[oracle(x) ^ c];
    ++steps;
    assert.ok(steps <= bound, 'Orbit exceeded expected bound');
  } while (x !== z);
  assert.equal(f(source), target);
  assert.ok(cache.size <= 9 + bound);
  return {source, queries: cache.size, steps, d};
}

function main() {
  const rng = random(0x41c05e7);
  const summary = [];
  for (let r = 1; r <= 4; ++r) {
    const lowMask = (1 << r) - 1;
    let maxQueries = 0;
    let maxSteps = 0;
    let total = 0;
    let exactRank = 0;
    /** @type {Record<string,number>} */
    const nullities = {};
    for (let instance = 0; instance < 128; ++instance) {
      const left = randomInvertible(rng);
      const right = randomInvertible(rng);
      const c = rng() & 255;
      const perms = Array.from({length: 1 << (8 - r)}, () => permutation(rng, 1 << r));
      /** @param {number} x */
      const f = x => {
        const z = linear(left, x);
        const q = z >>> r;
        return linear(right, (q << r) | perms[q][z & lowMask]) ^ c;
      };
      const baseA = left.map(col => linear(right, col & ~lowMask));
      assert.equal(rank(baseA), 8 - r, 'Intentional hidden base is singular');
      const f0 = f(0);
      const sampled = Array.from({length: 8}, (_, i) => f(1 << i) ^ f0);
      const residuals = Array.from({length: 256}, (_, x) => f(x) ^ f0 ^ linear(sampled, x));
      const rho = rank(residuals);
      assert.ok(rho <= r);
      if (rho === r) ++exactRank;
      for (let trial = 0; trial < 16; ++trial) {
        const secret = rng() & 255;
        const result = invertViaOrbit(f, f(secret), r);
        assert.equal(result.source, secret);
        assert.ok(result.queries <= 9 + (1 << Math.min(8, rho + result.d)));
        maxQueries = Math.max(maxQueries, result.queries);
        maxSteps = Math.max(maxSteps, result.steps);
        nullities[result.d] = (nullities[result.d] || 0) + 1;
        ++total;
      }
    }
    summary.push({r, sources: 128, targets: total, singularBaseRank: 8 - r,
      fullResidualRankSources: exactRank, maxQueries, maxSteps,
      theoremBound: 9 + (1 << Math.min(8, 2 * r)), nullities});
  }
  console.log(JSON.stringify({seed: '0x41c05e7', width: 8, summary}, null, 2));
}

if (require.main === module) main();

module.exports = {rank, repair, invertViaOrbit};
