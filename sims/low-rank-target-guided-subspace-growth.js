'use strict';

const assert = require('node:assert/strict');

const WIDTH = 10;
const SIZE = 1 << WIDTH;

/** @param {number} value @returns {number} */
function mask(value) {
  return value & (SIZE - 1);
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

/** @param {number[]} vectors @returns {number} */
function rank(vectors) {
  const pivots = Array(WIDTH).fill(0);
  let result = 0;
  for (const original of vectors) {
    let value = mask(original);
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

/** @param {number[]} vectors @returns {number[]} */
function basis(vectors) {
  const result = [];
  for (const value of vectors) {
    if (rank([...result, value]) > result.length) result.push(mask(value));
  }
  return result;
}

/**
 * @param {number[]} columns
 * @returns {{rank:number,kernelBasis:number[],solve:(rhs:number)=>number|null,remainder:(rhs:number)=>number}}
 */
function makeLinearSolver(columns) {
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

/** @param {number[]} columns @param {number} input @returns {number} */
function applyLinear(columns, input) {
  let output = 0;
  for (let bit = 0; bit < WIDTH; bit += 1) {
    if (((input >>> bit) & 1) !== 0) output ^= columns[bit];
  }
  return mask(output);
}

/** @param {number[]} basisVectors @returns {number[]} */
function span(basisVectors) {
  const points = [0];
  for (const vector of basisVectors) {
    const prior = points.slice();
    for (const point of prior) points.push(mask(point ^ vector));
  }
  return points;
}

/** @param {number[]} values @param {()=>number} next */
function shuffle(values, next) {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const other = next() % (index + 1);
    [values[index], values[other]] = [values[other], values[index]];
  }
}

/** @param {number} seed @returns {number[]} */
function makeLinearTransform(seed) {
  const next = makeRng(seed);
  const columns = Array.from({length: WIDTH}, (_, bit) => 1 << bit);
  for (let round = 0; round < 8 * WIDTH; round += 1) {
    const left = next() % WIDTH;
    let right = next() % WIDTH;
    if (left === right) right = (right + 1) % WIDTH;
    if ((next() & 1) === 0) [columns[left], columns[right]] = [columns[right], columns[left]];
    else columns[right] = mask(columns[right] ^ columns[left]);
  }
  assert.equal(rank(columns), WIDTH);
  return columns;
}

/**
 * Build a linear M with M(x) XOR x in U and requested kernel dimension.
 * @param {number[]} uBasis
 * @param {number} nullity
 * @returns {number[]}
 */
function makeDeficiencyColumns(uBasis, nullity) {
  const r = uBasis.length;
  assert.ok(nullity >= 0 && nullity <= r);
  const fullBasis = uBasis.slice();
  for (let bit = 0; bit < WIDTH && fullBasis.length < WIDTH; bit += 1) {
    const candidate = 1 << bit;
    if (rank([...fullBasis, candidate]) > fullBasis.length) fullBasis.push(candidate);
  }
  const coordinates = makeLinearSolver(fullBasis);
  assert.equal(coordinates.rank, WIDTH);

  /** @param {number} input @returns {number} */
  const transform = (input) => {
    const coefficients = coordinates.solve(input);
    assert.notEqual(coefficients, null);
    let output = 0;
    // Kill the first nullity coordinates of U and retain the remaining U coordinates.
    for (let index = nullity; index < r; index += 1) {
      if ((((/** @type {number} */ (coefficients)) >>> index) & 1) !== 0) output ^= uBasis[index];
    }
    // Fix every complement coordinate.
    for (let index = r; index < WIDTH; index += 1) {
      if ((((/** @type {number} */ (coefficients)) >>> index) & 1) !== 0) output ^= fullBasis[index];
    }
    return mask(output);
  };

  const columns = Array.from({length: WIDTH}, (_, bit) => transform(1 << bit));
  assert.equal(WIDTH - rank(columns), nullity);
  const uPoints = new Set(span(uBasis));
  for (let bit = 0; bit < WIDTH; bit += 1) assert.ok(uPoints.has(mask((1 << bit) ^ columns[bit])));
  return columns;
}

/**
 * @param {number[]} uBasis
 * @param {Map<number,number>} fixed
 * @param {number} seed
 * @returns {number[]}
 */
function makeCosetPermutation(uBasis, fixed, seed) {
  const next = makeRng(seed);
  const uPoints = span(uBasis);
  /** @type {Map<number,number[]>} */
  const groups = new Map();
  for (let input = 0; input < SIZE; input += 1) {
    let representative = SIZE;
    for (const offset of uPoints) representative = Math.min(representative, input ^ offset);
    const group = groups.get(representative);
    if (group) group.push(input);
    else groups.set(representative, [input]);
  }

  const permutation = Array(SIZE).fill(-1);
  for (const group of groups.values()) {
    const groupSet = new Set(group);
    const used = new Set();
    const freeInputs = [];
    for (const input of group) {
      const output = fixed.get(input);
      if (output === undefined) freeInputs.push(input);
      else {
        assert.ok(groupSet.has(output));
        assert.ok(!used.has(output));
        permutation[input] = output;
        used.add(output);
      }
    }
    const freeOutputs = group.filter((output) => !used.has(output));
    shuffle(freeOutputs, next);
    for (let index = 0; index < freeInputs.length; index += 1) permutation[freeInputs[index]] = freeOutputs[index];
  }
  assert.equal(new Set(permutation).size, SIZE);
  const displacements = permutation.map((output, input) => output ^ input);
  assert.equal(rank(displacements), uBasis.length);
  return permutation;
}

/**
 * @param {number} rangeDimension
 * @param {number} nullity
 * @param {number} seed
 * @returns {{oracle:(input:number)=>number}}
 */
function makeCase(rangeDimension, nullity, seed) {
  const inputUBasis = [0b0000000111, 0b0000111000, 0b0111000000, 0b1000001001].slice(0, rangeDimension);
  assert.equal(rank(inputUBasis), rangeDimension);
  const inner = makeLinearTransform(seed ^ 0x27d4eb2d);
  const outer = makeLinearTransform(seed ^ 0x85ebca6b);
  const middleUBasis = inputUBasis.map((vector) => applyLinear(inner, vector));
  const middleInterpolant = makeDeficiencyColumns(middleUBasis, nullity);
  const inputOffset = mask(makeRng(seed ^ 0x165667b1)());
  const outputOffset = mask(makeRng(seed ^ 0xc2b2ae35)());

  /** @type {Map<number,number>} */
  const fixed = new Map([[inputOffset, inputOffset]]);
  for (let bit = 0; bit < WIDTH; bit += 1) {
    const direction = applyLinear(inner, 1 << bit);
    fixed.set(
      mask(inputOffset ^ direction),
      mask(inputOffset ^ applyLinear(middleInterpolant, direction)),
    );
  }
  const permutation = makeCosetPermutation(middleUBasis, fixed, seed ^ 0x9e3779b9);
  const displacements = permutation.map((output, input) => output ^ input);
  assert.equal(rank(displacements), rangeDimension);

  const oracle = (input) => mask(
    applyLinear(outer, permutation[mask(applyLinear(inner, input) ^ inputOffset)]) ^ outputOffset,
  );
  const base = oracle(0);
  const columns = Array.from({length: WIDTH}, (_, bit) => oracle(1 << bit) ^ base);
  const expectedColumns = Array.from({length: WIDTH}, (_, bit) => applyLinear(
    outer,
    applyLinear(middleInterpolant, applyLinear(inner, 1 << bit)),
  ));
  assert.deepEqual(columns, expectedColumns);
  assert.equal(WIDTH - rank(columns), nullity);
  return {oracle};
}

/**
 * Las Vegas target inversion from the public affine interpolant and residual subspace.
 * @param {(input:number)=>number} oracle
 * @param {number} target
 * @param {number} randomSeed
 * @returns {{value:number,queryCount:number,nullity:number,searchQueries:number,expansions:number}}
 */
function invertLowRank(oracle, target, randomSeed) {
  /** @type {Map<number,number>} */
  const cache = new Map();
  /** @param {number} input @returns {number} */
  const query = (input) => {
    const key = mask(input);
    const prior = cache.get(key);
    if (prior !== undefined) return prior;
    const output = mask(oracle(key));
    cache.set(key, output);
    return output;
  };

  const base = query(0);
  const columns = Array.from({length: WIDTH}, (_, bit) => mask(query(1 << bit) ^ base));
  const solver = makeLinearSolver(columns);
  const nullity = WIDTH - solver.rank;
  const targetLabel = solver.remainder(mask(target ^ base));

  let matchedInput = 0;
  let matchedOutput = base;
  let searchQueries = 0;
  if (nullity > 0) {
    const order = Array.from({length: SIZE}, (_, input) => input);
    shuffle(order, makeRng(randomSeed));
    matchedInput = -1;
    matchedOutput = -1;
    for (const input of order) {
      const had = cache.has(input);
      const output = query(input);
      if (!had) searchQueries += 1;
      if (solver.remainder(mask(output ^ base)) === targetLabel) {
        matchedInput = input;
        matchedOutput = output;
        break;
      }
    }
    if (matchedInput < 0) throw new Error('quotient match missing');
  }

  const correction = solver.solve(mask(matchedOutput ^ target));
  if (correction === null) throw new Error('matching quotient difference was not in image(M)');
  const seed = mask(matchedInput ^ correction);
  let hBasis = solver.kernelBasis.slice();
  let expansions = 0;

  while (true) {
    const differences = [];
    for (const point of span(hBasis)) {
      const candidate = mask(seed ^ point);
      const output = query(candidate);
      if (output === mask(target)) {
        return {value: candidate, queryCount: cache.size, nullity, searchQueries, expansions};
      }
      differences.push(mask(output ^ target));
    }

    const differenceBasis = basis(differences);
    const preimageBasis = solver.kernelBasis.slice();
    for (const vector of span(differenceBasis)) {
      const preimage = solver.solve(vector);
      if (preimage !== null && rank([...preimageBasis, preimage]) > preimageBasis.length) {
        preimageBasis.push(preimage);
      }
    }
    const nextBasis = basis([...hBasis, ...preimageBasis]);
    if (nextBasis.length <= hBasis.length) {
      throw new Error('known U-subspace failed to expand before target recovery');
    }
    hBasis = nextBasis;
    expansions += 1;
  }
}

function main() {
  const rows = [];
  let totalTargets = 0;
  for (let rangeDimension = 1; rangeDimension <= 4; rangeDimension += 1) {
    for (let nullity = 0; nullity <= rangeDimension; nullity += 1) {
      let searchSum = 0;
      let searchMax = 0;
      let querySum = 0;
      let queryMax = 0;
      let expansionMax = 0;
      const cases = 6;
      for (let caseIndex = 0; caseIndex < cases; caseIndex += 1) {
        const seed = (0x243f6a88 ^ (rangeDimension << 24) ^ (nullity << 16) ^ caseIndex) >>> 0;
        const {oracle} = makeCase(rangeDimension, nullity, seed);
        for (let secret = 0; secret < SIZE; secret += 1) {
          const target = oracle(secret);
          const attack = invertLowRank(oracle, target, seed ^ secret ^ 0xb7e15162);
          assert.equal(attack.value, secret);
          assert.equal(attack.nullity, nullity);
          searchSum += attack.searchQueries;
          searchMax = Math.max(searchMax, attack.searchQueries);
          querySum += attack.queryCount;
          queryMax = Math.max(queryMax, attack.queryCount);
          expansionMax = Math.max(expansionMax, attack.expansions);
          totalTargets += 1;
        }
      }
      const targets = cases * SIZE;
      rows.push({
        rangeDimension,
        nullity,
        cases,
        targets,
        expectedSearchBound: 1 << nullity,
        meanSearchQueries: searchSum / targets,
        maxSearchQueries: searchMax,
        expectedTotalQueryBound: WIDTH + 1 + (1 << nullity) + (1 << rangeDimension),
        meanTotalQueries: querySum / targets,
        maxTotalQueries: queryMax,
        maxSubspaceExpansions: expansionMax,
      });
    }
  }
  console.log(JSON.stringify({width: WIDTH, rows, totalTargets}, null, 2));
}

if (require.main === module) main();

module.exports = {invertLowRank};
