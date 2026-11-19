'use strict';

const {randomBytes} = require('node:crypto');

const WIDTH = 32;

/** @param {number} value @returns {number} */
function u32(value) {
  return value >>> 0;
}

/** @param {number} bit @returns {number} */
function bitMask(bit) {
  return 2 ** bit;
}

/** @param {number[]} vectors @returns {number[]} */
function basis32(vectors) {
  const pivots = Array(WIDTH).fill(0);
  const result = [];
  for (const original of vectors) {
    let value = u32(original);
    for (let bit = WIDTH - 1; bit >= 0 && value !== 0; bit -= 1) {
      if (((value >>> bit) & 1) === 0) continue;
      if (pivots[bit] !== 0) value = u32(value ^ pivots[bit]);
      else {
        pivots[bit] = value;
        result.push(u32(original));
        break;
      }
    }
  }
  return result;
}

/** @param {number[]} vectors @returns {number} */
function rank32(vectors) {
  return basis32(vectors).length;
}

/**
 * @param {number[]} columns
 * @returns {{rank:number,kernelBasis:number[],solve:(rhs:number)=>number|null,remainder:(rhs:number)=>number}}
 */
function makeSolver32(columns) {
  const pivotImages = Array(WIDTH).fill(0);
  const pivotCoefficients = Array(WIDTH).fill(0);
  const kernelBasis = [];

  for (let index = 0; index < WIDTH; index += 1) {
    let image = u32(columns[index]);
    let coefficients = u32(bitMask(index));
    for (let bit = WIDTH - 1; bit >= 0 && image !== 0; bit -= 1) {
      if (((image >>> bit) & 1) === 0) continue;
      if (pivotImages[bit] !== 0) {
        image = u32(image ^ pivotImages[bit]);
        coefficients = u32(coefficients ^ pivotCoefficients[bit]);
      } else {
        pivotImages[bit] = image;
        pivotCoefficients[bit] = coefficients;
        break;
      }
    }
    if (image === 0) kernelBasis.push(coefficients);
  }

  const mapRank = pivotImages.filter(Boolean).length;

  /** @param {number} rhs @returns {number|null} */
  const solve = (rhs) => {
    let image = u32(rhs);
    let coefficients = 0;
    for (let bit = WIDTH - 1; bit >= 0 && image !== 0; bit -= 1) {
      if (((image >>> bit) & 1) === 0) continue;
      if (pivotImages[bit] === 0) return null;
      image = u32(image ^ pivotImages[bit]);
      coefficients = u32(coefficients ^ pivotCoefficients[bit]);
    }
    return image === 0 ? coefficients : null;
  };

  /** @param {number} rhs @returns {number} */
  const remainder = (rhs) => {
    let image = u32(rhs);
    for (let bit = WIDTH - 1; bit >= 0 && image !== 0; bit -= 1) {
      if (((image >>> bit) & 1) !== 0 && pivotImages[bit] !== 0) {
        image = u32(image ^ pivotImages[bit]);
      }
    }
    return image;
  };

  return {rank: mapRank, kernelBasis, solve, remainder};
}

/** @param {number[]} columns @returns {bigint[]} */
function kernelRelations32(columns) {
  const pivotImages = Array(WIDTH).fill(0);
  const pivotCoefficients = Array(WIDTH).fill(0n);
  const kernel = [];
  for (let index = 0; index < columns.length; index += 1) {
    let image = u32(columns[index]);
    let coefficients = 1n << BigInt(index);
    for (let bit = WIDTH - 1; bit >= 0 && image !== 0; bit -= 1) {
      if (((image >>> bit) & 1) === 0) continue;
      if (pivotImages[bit] !== 0) {
        image = u32(image ^ pivotImages[bit]);
        coefficients ^= pivotCoefficients[bit];
      } else {
        pivotImages[bit] = image;
        pivotCoefficients[bit] = coefficients;
        break;
      }
    }
    if (image === 0) kernel.push(coefficients);
  }
  return kernel;
}

/**
 * @param {number[]} leftVectors
 * @param {number[]} rightVectors
 * @returns {number[]}
 */
function intersectionBasis32(leftVectors, rightVectors) {
  const left = basis32(leftVectors);
  const right = basis32(rightVectors);
  const intersection = [];
  for (const relation of kernelRelations32([...left, ...right])) {
    let value = 0;
    for (let index = 0; index < left.length; index += 1) {
      if (((relation >> BigInt(index)) & 1n) !== 0n) value = u32(value ^ left[index]);
    }
    if (value !== 0) intersection.push(value);
  }
  return basis32(intersection);
}

/**
 * Visit every value in a subspace without materializing the full span.
 * @param {number[]} vectors
 * @param {((value:number)=>boolean|void} visit
 * @returns {boolean}
 */
function visitSpan32(vectors, visit) {
  const independent = basis32(vectors);
  /** @param {number} index @param {number} value @returns {boolean} */
  const walk = (index, value) => {
    if (index === independent.length) return visit(u32(value)) === true;
    if (walk(index + 1, value)) return true;
    return walk(index + 1, u32(value ^ independent[index]));
  };
  return walk(0, 0);
}

/** @param {number} seed @returns {()=>number} */
function makeRng32(seed) {
  let state = u32(seed) || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state = u32(state);
    return state;
  };
}

/**
 * Exact Las Vegas target inversion for a 32-bit permutation oracle.
 * Low public affine-residual rank makes this practical; high-rank candidates may hit the configured cap.
 * @param {(input:number)=>number} oracle
 * @param {number} target
 * @param {{seed?:number,maxQueries?:number,maxSubspaceDimension?:number}} [options]
 * `seed` selects deterministic xorshift sampling for reproducible tests. Without it, quotient search uses fresh cryptographic random samples.
 * @returns {{value:number,queries:number,nullity:number,searchQueries:number,expansions:number}}
 */
function invertPublicResidual32(oracle, target, options = {}) {
  const maxQueries = options.maxQueries ?? 1_000_000;
  const maxSubspaceDimension = options.maxSubspaceDimension ?? 20;
  const seededNext = options.seed === undefined ? null : makeRng32(options.seed);
  const next = seededNext ?? (() => randomBytes(4).readUInt32LE(0));
  /** @type {Map<number, number>} */
  const cache = new Map();

  /** @param {number} input @returns {number} */
  const query = (input) => {
    const key = u32(input);
    const prior = cache.get(key);
    if (prior !== undefined) return prior;
    if (cache.size >= maxQueries) throw new Error(`query cap ${maxQueries} reached`);
    const output = u32(oracle(key));
    cache.set(key, output);
    return output;
  };

  const normalizedTarget = u32(target);
  const base = query(0);

  const columns = Array.from({length: WIDTH}, (_, bit) => u32(query(bitMask(bit)) ^ base));
  for (const [input, output] of cache) {
    if (output === normalizedTarget) {
      const solver = makeSolver32(columns);
      return {value: input, queries: cache.size, nullity: WIDTH - solver.rank, searchQueries: 0, expansions: 0};
    }
  }

  const solver = makeSolver32(columns);
  const nullity = WIDTH - solver.rank;
  const targetLabel = solver.remainder(u32(normalizedTarget ^ base));

  let matchedInput = -1;
  let matchedOutput = -1;
  for (const [input, output] of cache) {
    if (solver.remainder(u32(output ^ base)) === targetLabel) {
      matchedInput = input;
      matchedOutput = output;
      break;
    }
  }

  let searchQueries = 0;
  while (matchedInput < 0) {
    const input = next();
    const had = cache.has(input);
    const output = query(input);
    if (!had) searchQueries += 1;
    if (output === normalizedTarget) {
      return {value: input, queries: cache.size, nullity, searchQueries, expansions: 0};
    }
    if (solver.remainder(u32(output ^ base)) === targetLabel) {
      matchedInput = input;
      matchedOutput = output;
    }
  }

  const correction = solver.solve(u32(matchedOutput ^ normalizedTarget));
  if (correction === null) throw new Error('matching quotient difference is outside image(M)');
  const seed = u32(matchedInput ^ correction);
  let hBasis = solver.kernelBasis.slice();
  let expansions = 0;

  while (true) {
    if (hBasis.length > maxSubspaceDimension) {
      throw new Error(`candidate subspace dimension ${hBasis.length} exceeds cap ${maxSubspaceDimension}`);
    }

    const differences = [];
    let found = -1;
    visitSpan32(hBasis, (point) => {
      const candidate = u32(seed ^ point);
      const output = query(candidate);
      if (output === normalizedTarget) {
        found = candidate;
        return true;
      }
      differences.push(u32(output ^ normalizedTarget));
      return false;
    });
    if (found >= 0) return {value: found, queries: cache.size, nullity, searchQueries, expansions};

    const intersection = intersectionBasis32(basis32(differences), columns);
    const preimageBasis = solver.kernelBasis.slice();
    for (const vector of intersection) {
      const preimage = solver.solve(vector);
      if (preimage === null) throw new Error('intersection vector is outside image(M)');
      if (rank32([...preimageBasis, preimage]) > preimageBasis.length) preimageBasis.push(preimage);
    }
    const nextBasis = basis32([...hBasis, ...preimageBasis]);
    if (nextBasis.length <= hBasis.length) throw new Error('target subspace failed to grow');
    hBasis = nextBasis;
    expansions += 1;
  }
}

module.exports = {
  basis32,
  intersectionBasis32,
  invertPublicResidual32,
  makeSolver32,
  rank32,
};
