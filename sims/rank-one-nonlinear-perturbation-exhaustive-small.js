'use strict';

const WIDTH = 3;
const SIZE = 1 << WIDTH;

/** @param {number[]} vectors @returns {number} */
function rank(vectors) {
  const pivots = Array(WIDTH).fill(0);
  let result = 0;
  for (const raw of vectors) {
    let value = raw;
    for (let bit = WIDTH - 1; bit >= 0 && value !== 0; bit -= 1) {
      if (((value >>> bit) & 1) === 0) continue;
      if (pivots[bit] !== 0) value ^= pivots[bit];
      else {
        pivots[bit] = value;
        result += 1;
        break;
      }
    }
  }
  return result;
}

/** @returns {number[][]} */
function allInvertibleLinearMaps() {
  const maps = [];
  for (let a = 1; a < SIZE; a += 1) {
    for (let b = 1; b < SIZE; b += 1) {
      for (let c = 1; c < SIZE; c += 1) {
        const columns = [a, b, c];
        if (rank(columns) === WIDTH) maps.push(columns);
      }
    }
  }
  return maps;
}

/** @param {number[]} columns @param {number} input @returns {number} */
function applyLinear(columns, input) {
  let output = 0;
  for (let bit = 0; bit < WIDTH; bit += 1) {
    if (((input >>> bit) & 1) !== 0) output ^= columns[bit];
  }
  return output;
}

/**
 * @param {number[]} columns
 * @returns {{rank:number,kernels:number[],solve:(rhs:number)=>number|null}}
 */
function makeSolver(columns) {
  const pivotImages = Array(WIDTH).fill(0);
  const pivotCoefficients = Array(WIDTH).fill(0);
  const kernels = [];

  for (let index = 0; index < WIDTH; index += 1) {
    let image = columns[index];
    let coefficients = 1 << index;
    for (let bit = WIDTH - 1; bit >= 0 && image !== 0; bit -= 1) {
      if (((image >>> bit) & 1) === 0) continue;
      if (pivotImages[bit] !== 0) {
        image ^= pivotImages[bit];
        coefficients ^= pivotCoefficients[bit];
      } else {
        pivotImages[bit] = image;
        pivotCoefficients[bit] = coefficients;
        break;
      }
    }
    if (image === 0) kernels.push(coefficients);
  }

  const mapRank = pivotImages.filter(Boolean).length;

  /** @param {number} rhs @returns {number|null} */
  const solve = (rhs) => {
    let image = rhs;
    let coefficients = 0;
    for (let bit = WIDTH - 1; bit >= 0 && image !== 0; bit -= 1) {
      if (((image >>> bit) & 1) === 0) continue;
      if (pivotImages[bit] === 0) return null;
      image ^= pivotImages[bit];
      coefficients ^= pivotCoefficients[bit];
    }
    return image === 0 ? coefficients : null;
  };

  return {rank: mapRank, kernels, solve};
}

/**
 * Independent width-3 implementation of the n+3 attack.
 * @param {(input:number)=>number} oracle
 * @param {number} target
 * @returns {{value:number,queryCount:number,interpolantRank:number}}
 */
function invertRankOne(oracle, target) {
  /** @type {Map<number,number>} */
  const cache = new Map();

  /** @param {number} input @returns {number} */
  const query = (input) => {
    const prior = cache.get(input);
    if (prior !== undefined) return prior;
    const output = oracle(input);
    cache.set(input, output);
    return output;
  };

  const base = query(0);
  const columns = Array.from(
    {length: WIDTH},
    (_, bit) => query(1 << bit) ^ base,
  );
  const solver = makeSolver(columns);
  const targetOffset = target ^ base;

  if (solver.rank === WIDTH) {
    const candidate = solver.solve(targetOffset);
    if (candidate === null) throw new Error('full-rank solve failed');
    const observed = query(candidate);
    if (observed === target) {
      return {value: candidate, queryCount: cache.size, interpolantRank: WIDTH};
    }
    const correction = solver.solve(observed ^ target);
    if (correction === null) throw new Error('full-rank correction failed');
    return {
      value: candidate ^ correction,
      queryCount: cache.size,
      interpolantRank: WIDTH,
    };
  }

  if (solver.rank !== WIDTH - 1 || solver.kernels.length !== 1) {
    throw new Error(`unexpected rank ${solver.rank}`);
  }

  const inputDirection = solver.kernels[0];
  const outputDirection = query(inputDirection) ^ base;
  let candidate = solver.solve(targetOffset);
  if (candidate === null) candidate = solver.solve(targetOffset ^ outputDirection);
  if (candidate === null) throw new Error('rank-deficient target solve failed');

  return {
    value: query(candidate) === target ? candidate : candidate ^ inputDirection,
    queryCount: cache.size,
    interpolantRank: WIDTH - 1,
  };
}

function main() {
  const linearMaps = allInvertibleLinearMaps();
  if (linearMaps.length !== 168) throw new Error('GL(3,2) enumeration mismatch');

  let permutationRepresentations = 0;
  let exactRecoveries = 0;
  let maxQueries = 0;
  /** @type {Map<number,number>} */
  const rankCounts = new Map();

  for (const linear of linearMaps) {
    for (let outputDirection = 1; outputDirection < SIZE; outputDirection += 1) {
      for (let truthTable = 0; truthTable < (1 << SIZE); truthTable += 1) {
        /** @param {number} input @returns {number} */
        const oracle = (input) => (
          applyLinear(linear, input) ^
          ((((truthTable >>> input) & 1) !== 0) ? outputDirection : 0)
        );

        const outputs = Array.from({length: SIZE}, (_, input) => oracle(input));
        if (new Set(outputs).size !== SIZE) continue;
        permutationRepresentations += 1;

        for (let secret = 0; secret < SIZE; secret += 1) {
          const attack = invertRankOne(oracle, outputs[secret]);
          if (attack.value !== secret) {
            throw new Error(
              `recovery mismatch truthTable=${truthTable} secret=${secret}`,
            );
          }
          if (attack.queryCount > WIDTH + 3) {
            throw new Error(`query bound exceeded: ${attack.queryCount}`);
          }
          exactRecoveries += 1;
          maxQueries = Math.max(maxQueries, attack.queryCount);
          rankCounts.set(
            attack.interpolantRank,
            (rankCounts.get(attack.interpolantRank) || 0) + 1,
          );
        }
      }
    }
  }

  console.log(JSON.stringify({
    width: WIDTH,
    invertibleLinearMaps: linearMaps.length,
    nonzeroOutputDirections: SIZE - 1,
    booleanTruthTablesPerRepresentation: 1 << SIZE,
    permutationRepresentations,
    targetsPerPermutationRepresentation: SIZE,
    totalExactRecoveries: exactRecoveries,
    interpolantRankRecoveries: Object.fromEntries([...rankCounts].sort()),
    maxQueries,
    theoremBound: WIDTH + 3,
    result: 'all exact',
  }, null, 2));
}

if (require.main === module) main();
