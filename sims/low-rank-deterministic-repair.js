'use strict';

const assert = require('node:assert/strict');

const WIDTH = 32;

/** @param {number} value @returns {number} */
function u32(value) {
  return value >>> 0;
}

/** @param {number} bit @returns {number} */
function bitValue(bit) {
  return u32(2 ** bit);
}

/** @param {number} seed @returns {()=>number} */
function makeRng(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
}

/** @param {number[]} columns @param {number} input @returns {number} */
function applyLinear(columns, input) {
  let x = input >>> 0;
  let output = 0;
  let bit = 0;
  while (x !== 0) {
    if ((x & 1) !== 0) output ^= columns[bit];
    x >>>= 1;
    bit += 1;
  }
  return output >>> 0;
}

/** @param {number} seed @returns {number[]} */
function makeLinearTransform(seed) {
  const next = makeRng(seed);
  const columns = Array.from({length: WIDTH}, (_, bit) => bitValue(bit));
  for (let round = 0; round < 512; round += 1) {
    const a = next() % WIDTH;
    let b = next() % WIDTH;
    if (a === b) b = (b + 1) % WIDTH;
    if ((next() & 1) === 0) {
      [columns[a], columns[b]] = [columns[b], columns[a]];
    } else {
      columns[b] = u32(columns[b] ^ columns[a]);
    }
  }
  return columns;
}

/**
 * @param {number[]} columns
 * @returns {{rank:number,kernels:number[],solve:(rhs:number)=>number|null}}
 */
function makeLinearSolver(columns) {
  const pivots = Array(WIDTH).fill(null);
  /** @type {number[]} */
  const kernels = [];

  for (let index = 0; index < WIDTH; index += 1) {
    let image = columns[index] >>> 0;
    let coefficients = bitValue(index);
    for (let bit = WIDTH - 1; bit >= 0 && image !== 0; bit -= 1) {
      if (((image >>> bit) & 1) === 0) continue;
      const pivot = pivots[bit];
      if (pivot !== null) {
        image = u32(image ^ pivot.image);
        coefficients = u32(coefficients ^ pivot.coefficients);
      } else {
        pivots[bit] = {image, coefficients};
        break;
      }
    }
    if (image === 0) kernels.push(coefficients >>> 0);
  }

  /** @param {number} rhs @returns {number|null} */
  const solve = (rhs) => {
    let image = rhs >>> 0;
    let coefficients = 0;
    for (let bit = WIDTH - 1; bit >= 0 && image !== 0; bit -= 1) {
      if (((image >>> bit) & 1) === 0) continue;
      const pivot = pivots[bit];
      if (pivot === null) return null;
      image = u32(image ^ pivot.image);
      coefficients = u32(coefficients ^ pivot.coefficients);
    }
    return image === 0 ? coefficients >>> 0 : null;
  };

  return {
    rank: pivots.filter((pivot) => pivot !== null).length,
    kernels,
    solve,
  };
}

/** @param {number} value @returns {number} */
function firstSetBit(value) {
  for (let bit = 0; bit < WIDTH; bit += 1) {
    if (((value >>> bit) & 1) !== 0) return bit;
  }
  throw new Error('zero vector has no set bit');
}

/** @param {number[]} basis @returns {number[]} */
function enumerateSpan(basis) {
  let values = [0];
  for (const vector of basis) {
    const prior = values;
    values = prior.concat(prior.map((value) => u32(value ^ vector)));
  }
  return values;
}

/**
 * Exact chosen-query inversion when all nonlinear displacement lies in a hidden
 * output subspace of dimension at most k.
 *
 * @param {(input:number)=>number} oracle
 * @param {number} target
 * @param {number} k
 * @returns {{value:number,queryCount:number,initialRank:number,rankRepairs:number,closureExpansions:number,maxClosureDimension:number,cycleLength:number}}
 */
function invertLowRankDisplacementExact(oracle, target, k) {
  /** @type {Map<number,number>} */
  const cache = new Map();

  /** @param {number} input @returns {number} */
  const query = (input) => {
    const key = input >>> 0;
    const prior = cache.get(key);
    if (prior !== undefined) return prior;
    const output = oracle(key) >>> 0;
    cache.set(key, output);
    return output;
  };

  const base = query(0);
  const columns = Array.from(
    {length: WIDTH},
    (_, bit) => u32(query(bitValue(bit)) ^ base),
  );
  const initialRank = makeLinearSolver(columns).rank;
  let rankRepairs = 0;
  let closureExpansions = 0;
  let maxClosureDimension = 0;

  for (;;) {
    const solver = makeLinearSolver(columns);
    if (solver.rank === WIDTH) break;
    if (solver.kernels.length === 0 || solver.kernels.length > k) {
      throw new Error(`unexpected nullity ${solver.kernels.length}`);
    }

    const closureBasis = solver.kernels.slice();
    let restartedForRankRepair = false;

    for (;;) {
      maxClosureDimension = Math.max(maxClosureDimension, closureBasis.length);
      if (closureBasis.length > k) {
        throw new Error(`closure exceeded promised dimension k=${k}`);
      }

      const closureValues = enumerateSpan(closureBasis);
      const closureSet = new Set(closureValues);
      let expanded = false;

      for (const direction of closureValues) {
        if (direction === 0) continue;
        const difference = u32(query(direction) ^ base);
        const preimage = solver.solve(difference);

        if (preimage === null) {
          const kernelDirection = solver.kernels[0] >>> 0;
          const bit = firstSetBit(kernelDirection);
          columns[bit] = u32(columns[bit] ^ difference);
          rankRepairs += 1;
          restartedForRankRepair = true;
          break;
        }

        if (!closureSet.has(preimage)) {
          closureBasis.push(preimage >>> 0);
          closureExpansions += 1;
          expanded = true;
          break;
        }
      }

      if (restartedForRankRepair) break;
      if (expanded) continue;
      throw new Error('subspace closure stalled despite singular interpolant');
    }
  }

  const fullRank = makeLinearSolver(columns);
  const transformedTarget = fullRank.solve(u32(target ^ base));
  if (transformedTarget === null) {
    throw new Error('full-rank surrogate did not solve target');
  }

  let current = transformedTarget;
  for (let step = 1; step <= 2 ** k; step += 1) {
    const transformedOutput = fullRank.solve(u32(query(current) ^ base));
    if (transformedOutput === null) {
      throw new Error('full-rank surrogate did not solve oracle output');
    }
    if (transformedOutput === transformedTarget) {
      const queryBound = WIDTH + 2 ** (k + 1);
      if (cache.size > queryBound) {
        throw new Error(`query bound exceeded: ${cache.size} > ${queryBound}`);
      }
      return {
        value: current >>> 0,
        queryCount: cache.size,
        initialRank,
        rankRepairs,
        closureExpansions,
        maxClosureDimension,
        cycleLength: step,
      };
    }
    current = transformedOutput;
  }

  throw new Error(`cycle exceeded hidden-coset bound 2^${k}`);
}

/**
 * A compatible permutation whose nonlinear displacement is restricted to the
 * highest k hidden-coordinate bits.
 * @param {number} seed
 * @param {number} k
 * @returns {(input:number)=>number}
 */
function makeTopKPermutation(seed, k) {
  const next = makeRng(seed);
  const lowerBits = WIDTH - k;
  const lowerMask = lowerBits === 32 ? 0xffffffff : (2 ** lowerBits - 1) >>> 0;
  const topMask = u32(0xffffffff ^ lowerMask);
  const m1 = next() | 1;
  const m2 = next() | 1;
  const add = next();

  return (input) => {
    const value = input >>> 0;
    const lower = value & lowerMask;
    let h = u32(Math.imul(lower ^ (lower >>> 13), m1) + add);
    h ^= h >>> 11;
    h = u32(Math.imul(h, m2));
    const displacement = h & topMask;
    return u32(value ^ displacement);
  };
}

function runGeneratedCorpus() {
  const rows = [];
  let total = 0;
  let singular = 0;
  let exact = 0;

  for (const k of [2, 4, 8]) {
    let rowSingular = 0;
    let rowExact = 0;
    let maxQueries = 0;
    let maxRepairs = 0;
    let maxClosureDimension = 0;
    let maxCycleLength = 0;

    for (let index = 0; index < 256; index += 1) {
      const seed = u32(0x9e3779b9 ^ Math.imul(k, 0x45d9f3b) ^ index);
      const inner = makeLinearTransform(seed ^ 0xa5a5a5a5);
      const outer = makeLinearTransform(seed ^ 0x5a5a5a5a);
      const permutation = makeTopKPermutation(seed ^ 0x243f6a88, k);
      const next = makeRng(seed ^ 0xbb67ae85);
      const inputOffset = next();
      const outputOffset = next();
      const secret = next();

      /** @param {number} input @returns {number} */
      const oracle = (input) => u32(
        applyLinear(
          outer,
          permutation(u32(applyLinear(inner, input) ^ inputOffset)),
        ) ^ outputOffset,
      );

      const attack = invertLowRankDisplacementExact(oracle, oracle(secret), k);
      assert.equal(attack.value, secret);
      assert.ok(attack.queryCount <= WIDTH + 2 ** (k + 1));
      if (attack.initialRank < WIDTH) {
        rowSingular += 1;
        singular += 1;
      }
      rowExact += 1;
      exact += 1;
      total += 1;
      maxQueries = Math.max(maxQueries, attack.queryCount);
      maxRepairs = Math.max(maxRepairs, attack.rankRepairs);
      maxClosureDimension = Math.max(
        maxClosureDimension,
        attack.maxClosureDimension,
      );
      maxCycleLength = Math.max(maxCycleLength, attack.cycleLength);
    }

    rows.push({
      k,
      generated: 256,
      initiallySingular: rowSingular,
      exactRecoveries: rowExact,
      theoremQueryBound: WIDTH + 2 ** (k + 1),
      maxQueries,
      maxRepairs,
      maxClosureDimension,
      maxCycleLength,
    });
  }

  return {total, singular, exact, rows};
}

function main() {
  const report = runGeneratedCorpus();
  console.log(JSON.stringify({
    model: 'hidden low-dimensional nonlinear displacement with deterministic singular-interpolant repair',
    theorem: 'all cases invert exactly within n + 2^(k+1) distinct chosen queries',
    ...report,
  }, null, 2));
}

if (require.main === module) main();

module.exports = {
  applyLinear,
  invertLowRankDisplacementExact,
  makeLinearSolver,
  makeLinearTransform,
  makeRng,
  makeTopKPermutation,
  u32,
};
