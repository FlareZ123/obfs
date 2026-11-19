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
      if (((image >>> bit) & 1) !== 0 && pivotImages[bit] !== 0) {
        image ^= pivotImages[bit];
      }
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

/** @param {number[]} basis @returns {number[]} */
function span(basis) {
  const points = [0];
  for (const vector of basis) {
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
 * Projection with kernel equal to kernelBasis and x XOR project(x) in its span.
 * @param {number[]} kernelBasis
 * @returns {number[]}
 */
function makeProjectionColumns(kernelBasis) {
  const fullBasis = kernelBasis.slice();
  for (let bit = 0; bit < WIDTH && fullBasis.length < WIDTH; bit += 1) {
    const candidate = 1 << bit;
    if (rank([...fullBasis, candidate]) > fullBasis.length) fullBasis.push(candidate);
  }
  assert.equal(fullBasis.length, WIDTH);
  const coordinates = makeLinearSolver(fullBasis);
  assert.equal(coordinates.rank, WIDTH);

  /** @param {number} input @returns {number} */
  const project = (input) => {
    const coefficientMask = coordinates.solve(input);
    assert.notEqual(coefficientMask, null);
    let output = 0;
    for (let index = kernelBasis.length; index < WIDTH; index += 1) {
      if (((/** @type {number} */ (coefficientMask) >>> index) & 1) !== 0) {
        output ^= fullBasis[index];
      }
    }
    return mask(output);
  };

  const columns = Array.from({length: WIDTH}, (_, bit) => project(1 << bit));
  assert.equal(rank(columns), WIDTH - kernelBasis.length);
  for (let bit = 0; bit < WIDTH; bit += 1) {
    assert.ok(span(kernelBasis).includes(mask((1 << bit) ^ columns[bit])));
  }
  return columns;
}

/**
 * Construct a permutation P(x)=x XOR g(x), g(x) in U, whose basis interpolation
 * is exactly the projection M with kernel U.
 * @param {number[]} kernelBasis
 * @param {number} seed
 * @returns {{permutation:number[],projection:number[]}}
 */
function makeCosetPermutation(kernelBasis, seed) {
  const next = makeRng(seed);
  const kernel = span(kernelBasis);
  const projection = makeProjectionColumns(kernelBasis);
  /** @type {Map<number,number[]>} */
  const groups = new Map();
  for (let input = 0; input < SIZE; input += 1) {
    let representative = SIZE;
    for (const offset of kernel) representative = Math.min(representative, input ^ offset);
    const group = groups.get(representative);
    if (group) group.push(input);
    else groups.set(representative, [input]);
  }

  /** @type {Map<number,number>} */
  const fixed = new Map([[0, 0]]);
  for (let bit = 0; bit < WIDTH; bit += 1) fixed.set(1 << bit, projection[bit]);

  const permutation = Array(SIZE).fill(-1);
  for (const group of groups.values()) {
    const groupSet = new Set(group);
    const usedOutputs = new Set();
    const remainingInputs = [];
    for (const input of group) {
      const output = fixed.get(input);
      if (output === undefined) {
        remainingInputs.push(input);
        continue;
      }
      assert.ok(groupSet.has(output));
      assert.ok(!usedOutputs.has(output));
      permutation[input] = output;
      usedOutputs.add(output);
    }
    const remainingOutputs = group.filter((output) => !usedOutputs.has(output));
    shuffle(remainingOutputs, next);
    assert.equal(remainingInputs.length, remainingOutputs.length);
    for (let index = 0; index < remainingInputs.length; index += 1) {
      permutation[remainingInputs[index]] = remainingOutputs[index];
    }
  }

  assert.equal(new Set(permutation).size, SIZE);
  for (let input = 0; input < SIZE; input += 1) {
    assert.ok(kernel.includes(mask(permutation[input] ^ input)));
  }
  return {permutation, projection};
}

/**
 * @param {number} rangeDimension
 * @param {number} seed
 * @returns {{oracle:(input:number)=>number,rangeDimension:number}}
 */
function makeCase(rangeDimension, seed) {
  const kernelBasis = [0b0000000111, 0b0000111000, 0b0111000000].slice(0, rangeDimension);
  assert.equal(rank(kernelBasis), rangeDimension);
  const {permutation, projection} = makeCosetPermutation(kernelBasis, seed ^ 0x9e3779b9);
  const outer = makeLinearTransform(seed ^ 0x85ebca6b);
  const outputOffset = mask(makeRng(seed ^ 0xc2b2ae35)());

  const oracle = (input) => mask(applyLinear(outer, permutation[mask(input)]) ^ outputOffset);
  const base = oracle(0);
  const columns = Array.from({length: WIDTH}, (_, bit) => oracle(1 << bit) ^ base);
  assert.deepEqual(columns, projection.map((column) => applyLinear(outer, column)));
  assert.equal(WIDTH - rank(columns), rangeDimension);
  return {oracle, rangeDimension};
}

/**
 * Exact inversion when the affine interpolant has nullity equal to the complete
 * nonlinear displacement rank.
 * @param {(input:number)}=>number} oracle
 * @param {number} target
 * @returns {{value:number,queryCount:number,nullity:number}}
 */
function invertMaximalDeficiency(oracle, target) {
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
  const kernel = span(solver.kernelBasis);
  assert.equal(kernel.length, 1 << nullity);
  const targetLabel = solver.remainder(mask(target ^ base));

  let witness = -1;
  for (const point of kernel) {
    if (solver.remainder(mask(query(point) ^ base)) === targetLabel) {
      witness = point;
      break;
    }
  }
  if (witness < 0) throw new Error('kernel quotient scan did not find target label');
  if (query(witness) === mask(target)) {
    return {value: witness, queryCount: cache.size, nullity};
  }

  const residual = mask(query(witness) ^ base);
  const seed = solver.solve(mask(target ^ base ^ residual));
  if (seed === null) throw new Error('target coset solve failed');
  const candidates = kernel.map((point) => mask(seed ^ point));

  const unresolved = [];
  for (const candidate of candidates) {
    const prior = cache.get(candidate);
    if (prior === mask(target)) return {value: candidate, queryCount: cache.size, nullity};
    if (prior === undefined) unresolved.push(candidate);
  }
  if (unresolved.length === 0) throw new Error('all target-coset candidates were cached without a match');
  for (let index = 0; index + 1 < unresolved.length; index += 1) {
    const candidate = unresolved[index];
    if (query(candidate) === mask(target)) {
      return {value: candidate, queryCount: cache.size, nullity};
    }
  }
  return {value: unresolved.at(-1), queryCount: cache.size, nullity};
}

function main() {
  const rows = [];
  let totalTargets = 0;
  for (const rangeDimension of [1, 2, 3]) {
    let maxQueries = 0;
    let cases = 0;
    for (let caseIndex = 0; caseIndex < 12; caseIndex += 1) {
      const seed = (0x243f6a88 ^ (rangeDimension << 24) ^ caseIndex) >>> 0;
      const {oracle} = makeCase(rangeDimension, seed);
      for (let secret = 0; secret < SIZE; secret += 1) {
        const target = oracle(secret);
        const attack = invertMaximalDeficiency(oracle, target);
        assert.equal(attack.value, secret);
        assert.equal(attack.nullity, rangeDimension);
        const bound = WIDTH + (1 << (rangeDimension + 1)) - 1;
        assert.ok(attack.queryCount <= bound, `${attack.queryCount} > ${bound}`);
        maxQueries = Math.max(maxQueries, attack.queryCount);
        totalTargets += 1;
      }
      cases += 1;
    }
    rows.push({
      rangeDimension,
      cases,
      targets: cases * SIZE,
      theoreticalQueryBound: WIDTH + (1 << (rangeDimension + 1)) - 1,
      observedMaxQueries: maxQueries,
    });
  }

  console.log(JSON.stringify({
    width: WIDTH,
    model: 'permutation F(x)=c+A*x+g(x), image(g) in hidden R, with dim ker(M)=dim(R)',
    rows,
    totalTargets,
  }, null, 2));
}

if (require.main === module) main();

module.exports = {invertMaximalDeficiency};
