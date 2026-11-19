'use strict';

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

/** @param {number} value @returns {number} */
function parity32(value) {
  let x = value >>> 0;
  x ^= x >>> 16;
  x ^= x >>> 8;
  x ^= x >>> 4;
  x &= 15;
  return (0x6996 >>> x) & 1;
}

/** @param {number} seed @returns {number[]} */
function makeLinearTransform(seed) {
  const next = makeRng(seed);
  const columns = Array.from({length: WIDTH}, (_, bit) => bitValue(bit));
  for (let round = 0; round < 512; round += 1) {
    const a = next() % WIDTH;
    let b = next() % WIDTH;
    if (a === b) b = (b + 1) % WIDTH;
    if ((next() & 1) === 0) [columns[a], columns[b]] = [columns[b], columns[a]];
    else columns[b] = u32(columns[b] ^ columns[a]);
  }
  return columns;
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

/**
 * Compatible permutation that leaves the lowest WIDTH-k bits unchanged and
 * applies k interacting triangular nonlinear shears to the highest bits.
 * Therefore P(x) XOR x always lies in a fixed k-dimensional subspace.
 * @param {number} seed
 * @param {number} k
 * @returns {(input:number)=>number}
 */
function makeTopKCompatiblePermutation(seed, k) {
  const next = makeRng(seed);
  const first = WIDTH - k;
  const specs = Array.from({length: k}, (_, offset) => {
    const bit = first + offset;
    const lowerMask = bit === 31 ? 0x7fffffff : u32((2 ** bit) - 1);
    return {
      a: next() & lowerMask,
      b: next() & lowerMask,
      c: next() & lowerMask,
      constant: next() & 1,
    };
  });

  return (input) => {
    const x = input >>> 0;
    let output = x;
    for (let offset = 0; offset < k; offset += 1) {
      const bit = first + offset;
      const lowerMask = bit === 31 ? 0x7fffffff : u32((2 ** bit) - 1);
      const lower = output & lowerMask;
      const spec = specs[offset];
      const control =
        parity32(lower & spec.a) ^
        (parity32(lower & spec.b) & parity32(lower & spec.c)) ^
        spec.constant;
      if (control !== 0) output = u32(output ^ bitValue(bit));
    }
    return output >>> 0;
  };
}

/**
 * Gaussian solver for a GF(2) linear map represented by image columns.
 * @param {number[]} columns
 * @returns {{rank:number,solve:(rhs:number)=>number|null}}
 */
function makeLinearSolver(columns) {
  const pivotImages = Array(WIDTH).fill(0);
  const pivotCoefficients = Array(WIDTH).fill(0);

  for (let index = 0; index < WIDTH; index += 1) {
    let image = columns[index] >>> 0;
    let coefficients = bitValue(index);
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
  }

  const rank = pivotImages.filter(Boolean).length;

  /** @param {number} rhs @returns {number|null} */
  const solve = (rhs) => {
    let image = rhs >>> 0;
    let coefficients = 0;
    for (let bit = WIDTH - 1; bit >= 0 && image !== 0; bit -= 1) {
      if (((image >>> bit) & 1) === 0) continue;
      if (pivotImages[bit] === 0) return null;
      image = u32(image ^ pivotImages[bit]);
      coefficients = u32(coefficients ^ pivotCoefficients[bit]);
    }
    return image === 0 ? coefficients >>> 0 : null;
  };

  return {rank, solve};
}

/**
 * Conditional exact inversion for a permutation with nonlinear output
 * displacement confined to a hidden k-dimensional subspace.
 *
 * @param {(input:number)=>number} oracle
 * @param {number} target
 * @param {number} k
 * @returns {{status:'recovered',value:number,queryCount:number,cycleLength:number}|{status:'singular',queryCount:number}}
 */
function invertLowRankDisplacement(oracle, target, k) {
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
  const solver = makeLinearSolver(columns);
  if (solver.rank !== WIDTH) {
    return {status: 'singular', queryCount: cache.size};
  }

  const transformedTarget = solver.solve(u32(target ^ base));
  if (transformedTarget === null) throw new Error('full-rank target solve failed');

  /** @param {number} input @returns {number} */
  const transformedOracle = (input) => {
    const value = solver.solve(u32(query(input) ^ base));
    if (value === null) throw new Error('full-rank oracle solve failed');
    return value;
  };

  let current = transformedTarget;
  const maxCycle = 2 ** k;
  for (let step = 1; step <= maxCycle; step += 1) {
    const next = transformedOracle(current);
    if (next === transformedTarget) {
      return {
        status: 'recovered',
        value: current,
        queryCount: cache.size,
        cycleLength: step,
      };
    }
    current = next;
  }

  throw new Error(`target cycle exceeded 2^${k}`);
}

function main() {
  const rows = [];
  let totalGenerated = 0;
  let totalRecovered = 0;

  for (const k of [2, 4]) {
    let fullRankCases = 0;
    let singularCases = 0;
    let maxQueries = 0;
    let maxCycleLength = 0;

    for (let caseIndex = 0; caseIndex < 256; caseIndex += 1) {
      const seed = u32(0x9e3779b9 ^ Math.imul(k, 0x45d9f3b) ^ caseIndex);
      const permutation = makeTopKCompatiblePermutation(seed ^ 0x243f6a88, k);
      const inner = makeLinearTransform(seed ^ 0x85a308d3);
      const outer = makeLinearTransform(seed ^ 0x13198a2e);
      const next = makeRng(seed ^ 0x03707344);
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

      const target = oracle(secret);
      const attack = invertLowRankDisplacement(oracle, target, k);
      totalGenerated += 1;

      if (attack.status === 'singular') {
        singularCases += 1;
        continue;
      }

      fullRankCases += 1;
      totalRecovered += 1;
      if (attack.value !== secret) {
        throw new Error(`k=${k} recovery mismatch case ${caseIndex}`);
      }
      const bound = WIDTH + 1 + (2 ** k);
      if (attack.queryCount > bound) {
        throw new Error(`k=${k} query bound exceeded: ${attack.queryCount}`);
      }
      maxQueries = Math.max(maxQueries, attack.queryCount);
      maxCycleLength = Math.max(maxCycleLength, attack.cycleLength);
    }

    if (fullRankCases === 0) throw new Error(`k=${k} produced no full-rank cases`);

    rows.push({
      nonlinearSubspaceDimension: k,
      generatedCases: 256,
      fullRankCases,
      singularCases,
      exactRecoveries: fullRankCases,
      theoremQueryBound: WIDTH + 1 + (2 ** k),
      maxObservedQueries: maxQueries,
      maxObservedCycleLength: maxCycleLength,
    });
  }

  console.log(JSON.stringify({
    model: 'two-sided affine-wrapped compatible permutations whose nonlinear displacement is confined to k hidden output dimensions',
    theorem: 'conditional on full-rank affine interpolant, inversion needs at most n+1+2^k chosen queries',
    generatedCases: totalGenerated,
    fullRankExactRecoveries: totalRecovered,
    rows,
    singularCasesAreExplicitlyOutOfScope: true,
  }, null, 2));
}

if (require.main === module) main();

module.exports = {
  applyLinear,
  bitValue,
  invertLowRankDisplacement,
  makeLinearTransform,
  makeRng,
  makeTopKCompatiblePermutation,
  u32,
};
