'use strict';

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
  const columns = Array.from({length: 32}, (_, bit) => bitValue(bit));
  for (let round = 0; round < 512; round += 1) {
    const a = next() % 32;
    let b = next() % 32;
    if (a === b) b = (b + 1) % 32;
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
 * Build one compatible rank-one shear. The top bit is toggled by an arbitrary
 * Boolean function of the lower 31 bits.
 * @param {number} seed
 * @param {'dense'|'sparse'} kind
 * @returns {(input:number)=>number}
 */
function makeShear(seed, kind) {
  const next = makeRng(seed);
  const a = next() & 0x7fffffff;
  const b = next() & 0x7fffffff;
  const c = next() & 0x7fffffff;
  const trigger = next() & 0x7fffffff;
  return (input) => {
    const z = input >>> 0;
    const lower = z & 0x7fffffff;
    const control = kind === 'sparse'
      ? Number(lower === trigger)
      : parity32(lower & a) ^
        (parity32(lower & b) & parity32(lower & c)) ^
        (parity32(lower & u32(a ^ b)) & parity32(lower & u32(b ^ c)));
    return u32(z ^ (control !== 0 ? 0x80000000 : 0));
  };
}

/**
 * Build a solver for a GF(2) linear map represented by image columns.
 * The tracked coefficient masks give preimages while Gaussian elimination is
 * performed directly on the 32-bit output vectors.
 * @param {number[]} columns
 * @returns {{rank:number,kernels:number[],solve:(rhs:number)=>number|null}}
 */
function makeLinearSolver(columns) {
  const pivotImages = Array(32).fill(0);
  const pivotCoefficients = Array(32).fill(0);
  const kernels = [];

  for (let index = 0; index < 32; index += 1) {
    let image = columns[index] >>> 0;
    let coefficients = bitValue(index);
    for (let bit = 31; bit >= 0 && image !== 0; bit -= 1) {
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

  const rank = pivotImages.filter(Boolean).length;

  /** @param {number} rhs @returns {number|null} */
  const solve = (rhs) => {
    let image = rhs >>> 0;
    let coefficients = 0;
    for (let bit = 31; bit >= 0 && image !== 0; bit -= 1) {
      if (((image >>> bit) & 1) === 0) continue;
      if (pivotImages[bit] === 0) return null;
      image = u32(image ^ pivotImages[bit]);
      coefficients = u32(coefficients ^ pivotCoefficients[bit]);
    }
    return image === 0 ? coefficients >>> 0 : null;
  };

  return {rank, kernels, solve};
}

/**
 * Exact target inversion for a two-sided affine-wrapped rank-one shear.
 *
 * The oracle has the form
 *   F(x) = c XOR A*x XOR w*f(x)
 * with A invertible, w=A*u, and f(x XOR u)=f(x).
 *
 * @param {(input:number)=>number} oracle
 * @param {number} target
 * @returns {{value:number,queryCount:number,interpolantRank:number}}
 */
function invertRankOneShear(oracle, target) {
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
    {length: 32},
    (_, bit) => u32(query(bitValue(bit)) ^ base),
  );
  const solver = makeLinearSolver(columns);
  const targetOffset = u32(target ^ base);

  if (solver.rank === 32) {
    const interpolated = solver.solve(targetOffset);
    if (interpolated === null) throw new Error('full-rank interpolant did not solve target');
    const observed = query(interpolated);
    if (observed === (target >>> 0)) {
      return {value: interpolated, queryCount: cache.size, interpolantRank: 32};
    }

    const outputDirection = u32(observed ^ target);
    const inputDirection = solver.solve(outputDirection);
    if (inputDirection === null) throw new Error('full-rank correction did not solve');
    return {
      value: u32(interpolated ^ inputDirection),
      queryCount: cache.size,
      interpolantRank: 32,
    };
  }

  if (solver.rank !== 31 || solver.kernels.length !== 1) {
    throw new Error(`unexpected interpolant rank ${solver.rank}`);
  }

  const inputDirection = solver.kernels[0] >>> 0;
  const outputDirection = u32(query(inputDirection) ^ base);

  let candidate = solver.solve(targetOffset);
  if (candidate === null) candidate = solver.solve(u32(targetOffset ^ outputDirection));
  if (candidate === null) throw new Error('rank-31 target lies outside both output cosets');

  if (query(candidate) === (target >>> 0)) {
    return {value: candidate, queryCount: cache.size, interpolantRank: 31};
  }
  return {
    value: u32(candidate ^ inputDirection),
    queryCount: cache.size,
    interpolantRank: 31,
  };
}

function main() {
  const rows = [];
  let total = 0;
  let maxQueries = 0;
  for (const kind of ['dense', 'sparse']) {
    /** @type {number[]} */
    const queries = [];
    /** @type {Map<number,number>} */
    const ranks = new Map();
    for (let caseIndex = 0; caseIndex < 128; caseIndex += 1) {
      const seed = u32(
        0x9e3779b9 ^
        caseIndex ^
        (kind === 'dense' ? 0x12345678 : 0x87654321),
      );
      const inner = makeLinearTransform(seed ^ 0xa5a5a5a5);
      const outer = makeLinearTransform(seed ^ 0x5a5a5a5a);
      const shear = makeShear(seed ^ 0x3c6ef372, /** @type {'dense'|'sparse'} */ (kind));
      const next = makeRng(seed ^ 0xbb67ae85);
      const inputOffset = next();
      const outputOffset = next();
      const secret = next();

      /** @param {number} input @returns {number} */
      const oracle = (input) => u32(
        applyLinear(
          outer,
          shear(u32(applyLinear(inner, input) ^ inputOffset)),
        ) ^ outputOffset,
      );

      const target = oracle(secret);
      const attack = invertRankOneShear(oracle, target);
      if (attack.value !== secret) {
        throw new Error(`${kind} recovery mismatch case ${caseIndex}`);
      }
      if (attack.queryCount > 35) {
        throw new Error(`query bound exceeded: ${attack.queryCount}`);
      }

      queries.push(attack.queryCount);
      ranks.set(
        attack.interpolantRank,
        (ranks.get(attack.interpolantRank) || 0) + 1,
      );
      total += 1;
      maxQueries = Math.max(maxQueries, attack.queryCount);
    }
    rows.push({
      kind,
      cases: 128,
      minQueries: Math.min(...queries),
      maxQueries: Math.max(...queries),
      interpolantRanks: Object.fromEntries([...ranks].sort()),
    });
  }

  console.log(JSON.stringify({
    model: 'one arbitrary compatible rank-one shear with unknown invertible affine wrappers on both sides',
    result: `all ${total} published targets inverted exactly`,
    generalQueryBound: 'n + 3',
    width32QueryBound: 35,
    observedMaxQueries: maxQueries,
    rows,
  }, null, 2));
}

if (require.main === module) main();

module.exports = {
  invertRankOneShear,
};
