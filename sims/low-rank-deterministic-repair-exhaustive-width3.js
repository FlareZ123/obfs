'use strict';

const assert = require('node:assert/strict');

const WIDTH = 3;
const SIZE = 1 << WIDTH;

/**
 * @param {number[]} columns
 * @returns {{rank:number,kernels:number[],solve:(rhs:number)=>number|null}}
 */
function makeSolver(columns) {
  const pivots = Array(WIDTH).fill(null);
  /** @type {number[]} */
  const kernels = [];

  for (let index = 0; index < WIDTH; index += 1) {
    let image = columns[index];
    let coefficients = 1 << index;
    for (let bit = WIDTH - 1; bit >= 0 && image !== 0; bit -= 1) {
      if (((image >>> bit) & 1) === 0) continue;
      const pivot = pivots[bit];
      if (pivot !== null) {
        image ^= pivot.image;
        coefficients ^= pivot.coefficients;
      } else {
        pivots[bit] = {image, coefficients};
        break;
      }
    }
    if (image === 0) kernels.push(coefficients);
  }

  /** @param {number} rhs @returns {number|null} */
  const solve = (rhs) => {
    let image = rhs;
    let coefficients = 0;
    for (let bit = WIDTH - 1; bit >= 0 && image !== 0; bit -= 1) {
      if (((image >>> bit) & 1) === 0) continue;
      const pivot = pivots[bit];
      if (pivot === null) return null;
      image ^= pivot.image;
      coefficients ^= pivot.coefficients;
    }
    return image === 0 ? coefficients : null;
  };

  return {
    rank: pivots.filter((pivot) => pivot !== null).length,
    kernels,
    solve,
  };
}

/** @param {number[]} basis @returns {number[]} */
function span(basis) {
  let values = [0];
  for (const vector of basis) {
    const prior = values;
    values = prior.concat(prior.map((value) => value ^ vector));
  }
  return values;
}

/** @param {number} value @returns {number} */
function firstSetBit(value) {
  for (let bit = 0; bit < WIDTH; bit += 1) {
    if (((value >>> bit) & 1) !== 0) return bit;
  }
  throw new Error('zero vector');
}

/**
 * @param {number[]} permutation
 * @param {number} target
 * @param {number} k
 * @returns {{value:number,queryCount:number,initialRank:number,repairs:number,expansions:number}}
 */
function invert(permutation, target, k) {
  /** @type {Map<number,number>} */
  const cache = new Map();
  /** @param {number} input @returns {number} */
  const query = (input) => {
    if (!cache.has(input)) cache.set(input, permutation[input]);
    return /** @type {number} */ (cache.get(input));
  };

  const base = query(0);
  const columns = Array.from(
    {length: WIDTH},
    (_, bit) => query(1 << bit) ^ base,
  );
  const initialRank = makeSolver(columns).rank;
  let repairs = 0;
  let expansions = 0;

  for (;;) {
    const solver = makeSolver(columns);
    if (solver.rank === WIDTH) break;

    const closureBasis = solver.kernels.slice();
    let repaired = false;

    for (;;) {
      assert.ok(closureBasis.length <= k);
      const values = span(closureBasis);
      const set = new Set(values);
      let expanded = false;

      for (const direction of values) {
        if (direction === 0) continue;
        const difference = query(direction) ^ base;
        const preimage = solver.solve(difference);
        if (preimage === null) {
          const q = solver.kernels[0];
          const bit = firstSetBit(q);
          columns[bit] ^= difference;
          repairs += 1;
          repaired = true;
          break;
        }
        if (!set.has(preimage)) {
          closureBasis.push(preimage);
          expansions += 1;
          expanded = true;
          break;
        }
      }

      if (repaired) break;
      if (expanded) continue;
      throw new Error('closure stalled');
    }
  }

  const solver = makeSolver(columns);
  const t = solver.solve(target ^ base);
  assert.notEqual(t, null);
  let current = /** @type {number} */ (t);
  const maxCycle = 2 ** k;

  for (let step = 1; step < maxCycle; step += 1) {
    const next = solver.solve(query(current) ^ base);
    assert.notEqual(next, null);
    if (next === t) {
      assert.ok(cache.size <= WIDTH + 2 ** (k + 1) - 1);
      return {
        value: current,
        queryCount: cache.size,
        initialRank,
        repairs,
        expansions,
      };
    }
    current = /** @type {number} */ (next);
  }

  assert.ok(cache.size <= WIDTH + 2 ** (k + 1) - 1);
  return {
    value: current,
    queryCount: cache.size,
    initialRank,
    repairs,
    expansions,
  };
}

/**
 * @param {number[]} values
 * @param {number} index
 * @param {(permutation:number[])=>void} visit
 */
function enumeratePermutations(values, index, visit) {
  if (index === values.length) {
    visit(values);
    return;
  }
  for (let swap = index; swap < values.length; swap += 1) {
    [values[index], values[swap]] = [values[swap], values[index]];
    enumeratePermutations(values, index + 1, visit);
    [values[index], values[swap]] = [values[swap], values[index]];
  }
}

/**
 * @param {number[]} columns
 * @param {number} input
 * @returns {number}
 */
function applyLinear(columns, input) {
  let output = 0;
  for (let bit = 0; bit < WIDTH; bit += 1) {
    if (((input >>> bit) & 1) !== 0) output ^= columns[bit];
  }
  return output;
}

/**
 * @param {number[]} permutation
 * @returns {number}
 */
function secondDifferenceRank(permutation) {
  const differences = [];
  for (let a = 0; a < SIZE; a += 1) {
    for (let b = 0; b < SIZE; b += 1) {
      differences.push(
        permutation[0]
        ^ permutation[a]
        ^ permutation[b]
        ^ permutation[a ^ b],
      );
    }
  }
  return vectorRank(differences);
}

/** @param {number[]} vectors @returns {number} */
function vectorRank(vectors) {
  const pivots = Array(WIDTH).fill(0);
  let count = 0;
  for (const raw of vectors) {
    let value = raw;
    for (let bit = WIDTH - 1; bit >= 0 && value !== 0; bit -= 1) {
      if (((value >>> bit) & 1) === 0) continue;
      if (pivots[bit] !== 0) value ^= pivots[bit];
      else {
        pivots[bit] = value;
        count += 1;
        break;
      }
    }
  }
  return count;
}

function main() {
  let permutations = 0;
  let targets = 0;
  let exact = 0;
  let singularModels = 0;
  let secondDifferenceChecks = 0;
  let maxQueries = 0;
  let maxRepairs = 0;
  let maxExpansions = 0;
  /** @type {Map<string,number>} */
  const regimes = new Map();

  enumeratePermutations(
    Array.from({length: SIZE}, (_, value) => value),
    0,
    (permutation) => {
      permutations += 1;
      const base = permutation[0];
      const columns = Array.from(
        {length: WIDTH},
        (_, bit) => permutation[1 << bit] ^ base,
      );
      const solver = makeSolver(columns);
      const residuals = Array.from(
        {length: SIZE},
        (_, input) => permutation[input] ^ base ^ applyLinear(columns, input),
      );
      const residualRank = vectorRank(residuals);
      assert.equal(secondDifferenceRank(permutation), residualRank);
      secondDifferenceChecks += 1;
      const nullity = WIDTH - solver.rank;
      assert.ok(nullity <= residualRank);
      if (nullity > 0) singularModels += 1;
      const key = `${residualRank}:${nullity}`;
      regimes.set(key, (regimes.get(key) || 0) + 1);

      for (let secret = 0; secret < SIZE; secret += 1) {
        const attack = invert(permutation, permutation[secret], residualRank);
        assert.equal(attack.value, secret);
        targets += 1;
        exact += 1;
        maxQueries = Math.max(maxQueries, attack.queryCount);
        maxRepairs = Math.max(maxRepairs, attack.repairs);
        maxExpansions = Math.max(maxExpansions, attack.expansions);
      }
    },
  );

  assert.equal(permutations, 40320);
  assert.equal(targets, 322560);
  assert.equal(exact, targets);

  console.log(JSON.stringify({
    width: WIDTH,
    permutations,
    initiallySingularModels: singularModels,
    secondDifferenceChecks,
    targetRecoveries: `${exact}/${targets}`,
    maxObservedDistinctQueries: maxQueries,
    maxRepairs,
    maxClosureExpansions: maxExpansions,
    regimes: Object.fromEntries([...regimes.entries()].sort()),
  }));
}

if (require.main === module) main();
