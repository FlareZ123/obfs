'use strict';

const {
  applyLinear,
  bitValue,
  makeLinearTransform,
  makeRng,
  makeTopKCompatiblePermutation,
  u32,
} = require('./low-rank-displacement-cycle-inversion.js');

const WIDTH = 32;

/**
 * @param {number[]} columns
 * @returns {{rank:number,kernels:number[],solve:(rhs:number)=>number|null}}
 */
function makeSolver(columns) {
  const pivotImages = Array(WIDTH).fill(0);
  const pivotCoefficients = Array(WIDTH).fill(0);
  const kernels = [];

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
    if (image === 0) kernels.push(coefficients >>> 0);
  }

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

  return {
    rank: pivotImages.filter(Boolean).length,
    kernels,
    solve,
  };
}

/** @param {number[]} basis @returns {number[]} */
function nonzeroSpan(basis) {
  const values = [];
  for (let mask = 1; mask < (1 << basis.length); mask += 1) {
    let value = 0;
    for (let index = 0; index < basis.length; index += 1) {
      if (((mask >>> index) & 1) !== 0) value ^= basis[index];
    }
    values.push(value >>> 0);
  }
  return values;
}

/** @param {number} value @returns {number} */
function firstSetBit(value) {
  for (let bit = 0; bit < WIDTH; bit += 1) {
    if (((value >>> bit) & 1) !== 0) return bit;
  }
  throw new Error('zero vector has no set bit');
}

/**
 * Empirical singular-interpolant repair.
 *
 * Every current surrogate N differs from the hidden affine baseline A by an
 * S-valued linear map. Therefore v in ker(N) implies A(v) in S, and every
 * difference F(x xor v) xor F(x) lies in S.
 *
 * An out-of-image difference repairs one rank. At rank 31, an in-image
 * difference can be right-inverted to another hidden input-subspace direction;
 * adding that same difference to one selected column rotates the kernel while
 * preserving the image and the S-valued surrogate error.
 *
 * The finite probe schedule is empirical. Failure to find a repair does not
 * prove that none exists.
 *
 * @param {(input:number)=>number} oracle
 * @param {number} target
 * @param {number} k
 * @param {number} seed
 * @returns {{status:'recovered',value:number,queryCount:number,repairs:number,rotations:number,probes:number}|{status:'unresolved',queryCount:number,rank:number,repairs:number,rotations:number,probes:number}}
 */
function invertWithEmpiricalRankRepair(oracle, target, k, seed) {
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
  const next = makeRng(seed ^ 0x31415926);
  const triedKernelDirections = new Set();
  let repairs = 0;
  let rotations = 0;
  let probes = 0;

  for (;;) {
    const solver = makeSolver(columns);

    if (solver.rank === WIDTH) {
      const transformedTarget = solver.solve(u32(target ^ base));
      if (transformedTarget === null) throw new Error('target solve failed');

      let current = transformedTarget;
      for (let step = 1; step <= 2 ** k; step += 1) {
        const transformedOutput = solver.solve(u32(query(current) ^ base));
        if (transformedOutput === null) throw new Error('oracle solve failed');
        if (transformedOutput === transformedTarget) {
          return {
            status: 'recovered',
            value: current,
            queryCount: cache.size,
            repairs,
            rotations,
            probes,
          };
        }
        current = transformedOutput;
      }
      throw new Error(`target cycle exceeded 2^${k}`);
    }

    let repaired = false;
    /** @type {Array<{direction:number,difference:number}>} */
    const rotationCandidates = [];

    for (const direction of nonzeroSpan(solver.kernels)) {
      for (let sample = 0; sample < 32; sample += 1) {
        const input = next();
        const difference = u32(
          query(u32(input ^ direction)) ^ query(input),
        );
        probes += 1;

        const preimage = solver.solve(difference);
        if (preimage === null) {
          const bit = firstSetBit(direction);
          columns[bit] = u32(columns[bit] ^ difference);
          repairs += 1;
          repaired = true;
          break;
        }

        if (solver.rank === WIDTH - 1) {
          for (const candidate of [
            preimage >>> 0,
            u32(preimage ^ direction),
          ]) {
            if (
              candidate !== 0 &&
              !triedKernelDirections.has(candidate)
            ) {
              rotationCandidates.push({
                direction: candidate,
                difference,
              });
            }
          }
        }
      }
      if (repaired) break;
    }

    if (repaired) continue;

    if (
      solver.rank === WIDTH - 1 &&
      rotationCandidates.length > 0 &&
      rotations < 32
    ) {
      const currentKernel = solver.kernels[0] >>> 0;
      const candidate = rotationCandidates[0];
      triedKernelDirections.add(currentKernel);
      triedKernelDirections.add(candidate.direction);
      const bit = firstSetBit(candidate.direction);
      columns[bit] = u32(columns[bit] ^ candidate.difference);
      rotations += 1;
      continue;
    }

    return {
      status: 'unresolved',
      queryCount: cache.size,
      rank: solver.rank,
      repairs,
      rotations,
      probes,
    };
  }
}

function main() {
  const rows = [];
  let exactRecoveries = 0;

  for (const k of [2, 4]) {
    let recovered = 0;
    let unresolved = 0;
    let maxQueries = 0;
    let maxRepairs = 0;
    let maxRotations = 0;

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

      const attack = invertWithEmpiricalRankRepair(
        oracle,
        oracle(secret),
        k,
        seed,
      );

      if (attack.status === 'unresolved') {
        unresolved += 1;
        continue;
      }

      if (attack.value !== secret) {
        throw new Error(`k=${k} recovery mismatch case ${caseIndex}`);
      }
      recovered += 1;
      exactRecoveries += 1;
      maxQueries = Math.max(maxQueries, attack.queryCount);
      maxRepairs = Math.max(maxRepairs, attack.repairs);
      maxRotations = Math.max(maxRotations, attack.rotations);
    }

    rows.push({
      nonlinearSubspaceDimension: k,
      generatedCases: 256,
      recovered,
      unresolved,
      maxQueries,
      maxRepairs,
      maxRotations,
    });
  }

  console.log(JSON.stringify({
    model: 'empirical rank repair followed by exact hidden-coset cycle inversion',
    generatedCases: 512,
    exactRecoveries,
    rows,
    warning: 'probe schedule is empirical; zero unresolved cases in this corpus is not a worst-case theorem',
  }, null, 2));
}

if (require.main === module) main();

module.exports = {invertWithEmpiricalRankRepair};
