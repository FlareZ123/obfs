'use strict';

const assert = require('node:assert/strict');

const WIDTH = 3;
const SIZE = 1 << WIDTH;

/** @param {number} value @returns {number} */
function mask(value) { return value & (SIZE - 1); }

/** @param {number[]} vectors @returns {number[]} */
function basis(vectors) {
  const pivots = Array(WIDTH).fill(0);
  const result = [];
  for (const original of vectors) {
    let value = mask(original);
    for (let bit = WIDTH - 1; bit >= 0 && value !== 0; bit -= 1) {
      if (((value >>> bit) & 1) === 0) continue;
      if (pivots[bit] !== 0) value ^= pivots[bit];
      else {
        pivots[bit] = value;
        result.push(mask(original));
        break;
      }
    }
  }
  return result;
}

/** @param {number[]} vectors @returns {number} */
function rank(vectors) { return basis(vectors).length; }


/** @param {number[]} columns @returns {bigint[]} */
function kernelRelations(columns) {
  const pivotImages = Array(WIDTH).fill(0);
  const pivotCoefficients = Array(WIDTH).fill(0n);
  const kernel = [];
  for (let index = 0; index < columns.length; index += 1) {
    let image = mask(columns[index]);
    let coefficients = 1n << BigInt(index);
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
    if (image === 0) kernel.push(coefficients);
  }
  return kernel;
}

/**
 * @param {number[]} leftVectors
 * @param {number[]} rightVectors
 * @returns {number[]}
 */
function intersectionBasis(leftVectors, rightVectors) {
  const left = basis(leftVectors);
  const right = basis(rightVectors);
  const intersection = [];
  for (const relation of kernelRelations([...left, ...right])) {
    let value = 0;
    for (let index = 0; index < left.length; index += 1) {
      if (((relation >> BigInt(index)) & 1n) !== 0n) value ^= left[index];
    }
    if (value !== 0) intersection.push(mask(value));
  }
  return basis(intersection);
}

/** @param {number[]} columns @param {number} input @returns {number} */
function applyLinear(columns, input) {
  let output = 0;
  for (let bit = 0; bit < WIDTH; bit += 1) {
    if (((input >>> bit) & 1) !== 0) output ^= columns[bit];
  }
  return mask(output);
}

/** @param {number[]} vectors @returns {number[]} */
function span(vectors) {
  const points = [0];
  for (const vector of basis(vectors)) {
    const prior = points.slice();
    for (const point of prior) points.push(mask(point ^ vector));
  }
  return points;
}

/**
 * @param {number[]} columns
 * @returns {{rank:number,kernelBasis:number[],solve:(rhs:number)=>number|null,remainder:(rhs:number)=>number}}
 */
function makeSolver(columns) {
  const pivotImages = Array(WIDTH).fill(0);
  const pivotCoefficients = Array(WIDTH).fill(0);
  const kernelBasis = [];
  for (let index = 0; index < WIDTH; index += 1) {
    let image = mask(columns[index]);
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
    if (image === 0) kernelBasis.push(mask(coefficients));
  }
  const mapRank = pivotImages.filter(Boolean).length;
  /** @param {number} rhs @returns {number|null} */
  const solve = (rhs) => {
    let image = mask(rhs);
    let coefficients = 0;
    for (let bit = WIDTH - 1; bit >= 0 && image !== 0; bit -= 1) {
      if (((image >>> bit) & 1) === 0) continue;
      if (pivotImages[bit] === 0) return null;
      image ^= pivotImages[bit];
      coefficients ^= pivotCoefficients[bit];
    }
    return image === 0 ? mask(coefficients) : null;
  };
  /** @param {number} rhs @returns {number} */
  const remainder = (rhs) => {
    let image = mask(rhs);
    for (let bit = WIDTH - 1; bit >= 0 && image !== 0; bit -= 1) {
      if (((image >>> bit) & 1) !== 0 && pivotImages[bit] !== 0) image ^= pivotImages[bit];
    }
    return mask(image);
  };
  return {rank: mapRank, kernelBasis, solve, remainder};
}

/** @param {number[]} permutation @param {number} target @returns {{value:number,queries:number,nullity:number}} */
function invert(permutation, target) {
  const cache = new Map();
  /** @param {number} input @returns {number} */
  const query = (input) => {
    const key = mask(input);
    if (!cache.has(key)) cache.set(key, permutation[key]);
    return /** @type {number} */ (cache.get(key));
  };
  const c0 = query(0);
  const columns = Array.from({length: WIDTH}, (_, bit) => query(1 << bit) ^ c0);
  const solver = makeSolver(columns);
  const targetLabel = solver.remainder(target ^ c0);
  let matchedInput = -1;
  let matchedOutput = -1;
  for (let input = 0; input < SIZE; input += 1) {
    const output = query(input);
    if (solver.remainder(output ^ c0) === targetLabel) {
      matchedInput = input;
      matchedOutput = output;
      break;
    }
  }
  assert.ok(matchedInput >= 0);
  const correction = solver.solve(matchedOutput ^ target);
  assert.notEqual(correction, null);
  const seed = mask(matchedInput ^ /** @type {number} */ (correction));
  let hBasis = solver.kernelBasis.slice();
  while (true) {
    const differences = [];
    for (const point of span(hBasis)) {
      const candidate = seed ^ point;
      const output = query(candidate);
      if (output === target) return {value: candidate, queries: cache.size, nullity: WIDTH - solver.rank};
      differences.push(output ^ target);
    }
    const differenceBasis = basis(differences);
    const intersection = intersectionBasis(differenceBasis, columns);
    const preimageBasis = solver.kernelBasis.slice();
    for (const vector of intersection) {
      const preimage = solver.solve(vector);
      assert.notEqual(preimage, null);
      if (rank([...preimageBasis, /** @type {number} */ (preimage)]) > preimageBasis.length) {
        preimageBasis.push(/** @type {number} */ (preimage));
      }
    }
    const next = basis([...hBasis, ...preimageBasis]);
    assert.ok(next.length > hBasis.length);
    hBasis = next;
  }
}

/** @param {number[]} values @param {number} index @param {(permutation:number[])=>void} visit */
function permute(values, index, visit) {
  if (index === values.length) {
    visit(values);
    return;
  }
  for (let swap = index; swap < values.length; swap += 1) {
    [values[index], values[swap]] = [values[swap], values[index]];
    permute(values, index + 1, visit);
    [values[index], values[swap]] = [values[swap], values[index]];
  }
}

function main() {
  const values = Array.from({length: SIZE}, (_, index) => index);
  let permutations = 0;
  let targets = 0;
  const byRank = new Map();
  let maxQueries = 0;
  permute(values, 0, (permutation) => {
    permutations += 1;
    const c0 = permutation[0];
    const columns = Array.from({length: WIDTH}, (_, bit) => permutation[1 << bit] ^ c0);
    const nullity = WIDTH - rank(columns);
    const residuals = permutation.map(
      (output, input) => mask(output ^ c0 ^ applyLinear(columns, input)),
    );
    const residualRank = rank(residuals);
    assert.ok(residualRank >= nullity);
    for (let secret = 0; secret < SIZE; secret += 1) {
      const attack = invert(permutation, permutation[secret]);
      assert.equal(attack.value, secret);
      assert.equal(attack.nullity, nullity);
      targets += 1;
      maxQueries = Math.max(maxQueries, attack.queries);
      const key = `${residualRank}:${nullity}`;
      byRank.set(key, (byRank.get(key) ?? 0) + 1);
    }
  });
  console.log(JSON.stringify({width: WIDTH, permutations, targets, maxQueries, regimes: Object.fromEntries([...byRank.entries()].sort())}, null, 2));
}

main();
