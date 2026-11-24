'use strict';

const assert = require('node:assert/strict');

/** @typedef {number[]} GF2Columns */
/** @typedef {{ values: Map<number, number>, query: (input: number) => number }} QueryCache */

/** @param {number} seed @returns {() => number} */
function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
}

/** @param {number} seed @returns {GF2Columns} */
function makeLinearTransform(seed) {
  const next = seeded(seed);
  const columns = Array.from({ length: 32 }, (_, bit) => (2 ** bit) >>> 0);
  for (let round = 0; round < 512; round++) {
    const a = next() % 32;
    let b = next() % 32;
    if (a === b) b = (b + 1) % 32;
    if ((next() & 1) === 0) {
      [columns[a], columns[b]] = [columns[b], columns[a]];
    } else {
      columns[b] = (columns[b] ^ columns[a]) >>> 0;
    }
  }
  return columns;
}

/** @param {GF2Columns} columns @param {number} input @returns {number} */
function applyLinear(columns, input) {
  let x = input >>> 0;
  let output = 0;
  let bit = 0;
  while (x !== 0) {
    if (x & 1) output = (output ^ columns[bit]) >>> 0;
    x >>>= 1;
    bit++;
  }
  return output >>> 0;
}

/** @param {number[]} vectors @returns {number} */
function rankOfVectors(vectors) {
  const basis = Array(32).fill(0);
  let rank = 0;
  for (const value0 of vectors) {
    let value = value0 >>> 0;
    for (let bit = 31; bit >= 0; bit--) {
      if (!((value >>> bit) & 1)) continue;
      if (basis[bit]) {
        value = (value ^ basis[bit]) >>> 0;
      } else {
        basis[bit] = value;
        rank++;
        break;
      }
    }
  }
  return rank;
}

/** @param {number[]} basis @param {number} vector @returns {boolean} */
function extendBasis(basis, vector) {
  let remaining = vector >>> 0;
  for (let bit = 31; bit >= 0; bit--) {
    if (!((remaining >>> bit) & 1)) continue;
    if (basis[bit]) {
      remaining = (remaining ^ basis[bit]) >>> 0;
    } else {
      basis[bit] = remaining;
      return true;
    }
  }
  return false;
}

/** @param {GF2Columns} columns @returns {((rhs: number) => number) | null} */
function inverseOfColumns(columns) {
  const pivots = Array(32).fill(0);
  const preimages = Array(32).fill(0);
  for (let index = 0; index < 32; index++) {
    let image = columns[index] >>> 0;
    let preimage = (2 ** index) >>> 0;
    for (let bit = 31; bit >= 0 && image !== 0; bit--) {
      if (((image >>> bit) & 1) === 0) continue;
      if (pivots[bit] !== 0) {
        image = (image ^ pivots[bit]) >>> 0;
        preimage = (preimage ^ preimages[bit]) >>> 0;
      } else {
        pivots[bit] = image;
        preimages[bit] = preimage;
        break;
      }
    }
    if (image === 0) return null;
  }
  return (rhs) => {
    let image = rhs >>> 0;
    let preimage = 0;
    for (let bit = 31; bit >= 0 && image !== 0; bit--) {
      if (((image >>> bit) & 1) === 0) continue;
      if (pivots[bit] === 0) throw new Error('missing pivot');
      image = (image ^ pivots[bit]) >>> 0;
      preimage = (preimage ^ preimages[bit]) >>> 0;
    }
    if (image !== 0) throw new Error('linear solve incomplete');
    return preimage >>> 0;
  };
}

/** @param {GF2Columns} columns @returns {GF2Columns} */
function inverseColumns(columns) {
  const rows = [];
  for (let row = 0; row < 32; row++) {
    let left = 0;
    for (let col = 0; col < 32; col++) {
      if ((columns[col] >>> row) & 1) left = (left ^ (1 << col)) >>> 0;
    }
    rows.push({ left, right: (1 << row) >>> 0 });
  }
  for (let pivot = 0; pivot < 32; pivot++) {
    let selected = pivot;
    while (selected < 32 && !((rows[selected].left >>> pivot) & 1)) selected++;
    if (selected === 32) throw new Error('singular completion');
    [rows[selected], rows[pivot]] = [rows[pivot], rows[selected]];
    for (let row = 0; row < 32; row++) {
      if (row !== pivot && ((rows[row].left >>> pivot) & 1)) {
        rows[row].left = (rows[row].left ^ rows[pivot].left) >>> 0;
        rows[row].right = (rows[row].right ^ rows[pivot].right) >>> 0;
      }
    }
  }
  return Array.from({ length: 32 }, (_, column) => {
    let value = 0;
    for (let row = 0; row < 32; row++) {
      if ((rows[row].right >>> column) & 1) value = (value ^ (1 << row)) >>> 0;
    }
    return value;
  });
}

/** @param {number} input @returns {number} */
function quinticCore(input) {
  const x = input >>> 0;
  return (x ^ ((x & 31) === 31 ? 128 : 0) ^ ((x & 124) === 124 ? 256 : 0)) >>> 0;
}

/** @param {(input: number) => number} oracle @returns {QueryCache} */
function makeCache(oracle) {
  const values = new Map();
  /** @param {number} input @returns {number} */
  function query(input) {
    const key = input >>> 0;
    if (!values.has(key)) values.set(key, oracle(key) >>> 0);
    return /** @type {number} */ (values.get(key));
  }
  return { values, query };
}

/** @param {QueryCache} cache @param {number} seed @returns {object} */
function prepareReanchor(cache, seed) {
  const draw = seeded(seed);
  const failed = [];
  for (let attempt = 0; attempt < 4; attempt++) {
    const anchor = draw() >>> 0;
    const base = cache.query(anchor);
    const columns = Array.from({ length: 32 }, (_, bit) =>
      (cache.query((anchor ^ (2 ** bit)) >>> 0) ^ base) >>> 0);
    const solve = inverseOfColumns(columns);
    if (!solve) {
      failed.push({ anchor, rank: rankOfVectors(columns), queryCount: cache.values.size });
      continue;
    }
    return { anchor, base, solve, attempts: attempt + 1, failed };
  }
  throw new Error('no full-rank reanchor');
}

/** @param {(input: number) => number} query @param {object} basis @param {number} target @returns {object} */
function invertWithReanchor(query, basis, target) {
  let candidate = (basis.anchor ^ basis.solve((target ^ basis.base) >>> 0)) >>> 0;
  let corrections = 0;
  let checks = 0;
  for (let step = 0; step < 32; step++) {
    const observed = query(candidate);
    checks++;
    if (observed === (target >>> 0)) return { preimage: candidate, corrections, checks };
    candidate = (candidate ^ basis.solve((target ^ observed) >>> 0)) >>> 0;
    corrections++;
  }
  throw new Error('reanchor did not verify target');
}

/** @param {(input: number) => number} query @returns {object} */
function prepareRankTwo(query) {
  const constant = query(0);
  const columns = Array.from({ length: 32 }, (_, bit) =>
    (query((2 ** bit) >>> 0) ^ constant) >>> 0);
  const basis = Array(32).fill(0);
  const free = [];
  for (let bit = 0; bit < 32; bit++) {
    if (!extendBasis(basis, columns[bit])) free.push(bit);
  }
  if (free.length > 2) throw new Error('fixture exceeds rank-two promise');
  const completed = columns.slice();
  for (const column of free) {
    let filled = false;
    for (let bit = 0; bit < 32; bit++) {
      const direction = (2 ** bit) >>> 0;
      if (extendBasis(basis, direction)) {
        completed[column] = (columns[column] ^ direction) >>> 0;
        filled = true;
        break;
      }
    }
    if (!filled) throw new Error('could not complete affine interpolant');
  }
  return {
    constant,
    nullity: free.length,
    inverse: inverseColumns(completed),
    orbitBound: 2 ** (2 + free.length),
  };
}

/** @param {(input: number) => number} query @param {object} basis @param {number} target @returns {object} */
function invertWithRankTwo(query, basis, target) {
  const wanted = applyLinear(basis.inverse, (target ^ basis.constant) >>> 0);
  let current = wanted;
  for (let step = 1; step <= basis.orbitBound; step++) {
    const next = applyLinear(basis.inverse, (query(current) ^ basis.constant) >>> 0);
    if (next === wanted) return { preimage: current, orbitCalls: step };
    current = next;
  }
  throw new Error('rank-two orbit cap exhausted');
}

function main() {
  const inputColumns = makeLinearTransform(0x12345678);
  const outputColumns = makeLinearTransform(0x9abcdef0);
  const inputSolve = inverseOfColumns(inputColumns);
  const outputSolve = inverseOfColumns(outputColumns);
  assert.ok(inputSolve && outputSolve);
  const inputBias = 0x13579bdf;
  const outputBias = 0x2468ace0;
  /** @param {number} input @returns {number} */
  function oracle(input) {
    const hidden = (applyLinear(inputColumns, input) ^ inputBias) >>> 0;
    return (applyLinear(outputColumns, quinticCore(hidden)) ^ outputBias) >>> 0;
  }

  const secrets = [
    0x4f0ff4eb, 0xc108ecdd, 0xa58a6017, 0x34f93989,
    0x640944ac, 0x805d7db1, 0xc2b25462, 0x7cf97486,
  ];
  const targets = secrets.map(oracle);
  for (const word of [0, 1, 2, 3, 0x80000000, 0xffffffff, secrets[0]]) {
    assert.equal(quinticCore(quinticCore(word)), word >>> 0);
  }

  const affineColumns = Array.from({ length: 32 }, (_, bit) =>
    applyLinear(outputColumns, applyLinear(inputColumns, (2 ** bit) >>> 0)));
  const nonlinearDirections = [
    applyLinear(outputColumns, 1 << 7),
    applyLinear(outputColumns, 1 << 8),
  ];
  assert.equal(rankOfVectors(affineColumns), 32);
  assert.equal(rankOfVectors(nonlinearDirections), 2);

  const reanchorCache = makeCache(oracle);
  const reanchorBasis = prepareReanchor(reanchorCache, 0xdeadbeef);
  assert.equal(reanchorBasis.anchor, 0xba8c2458);
  assert.equal(reanchorBasis.attempts, 3);
  assert.deepEqual(reanchorBasis.failed.map((x) => x.rank), [31, 31]);

  const anchorBase = oracle(reanchorBasis.anchor);
  const anchorColumns = Array.from({ length: 32 }, (_, bit) =>
    (oracle((reanchorBasis.anchor ^ (2 ** bit)) >>> 0) ^ anchorBase) >>> 0);
  assert.equal(rankOfVectors(anchorColumns), 32);
  const normalizedB = Array.from({ length: 32 }, (_, bit) =>
    outputSolve(applyLinear(anchorColumns, inputSolve((2 ** bit) >>> 0))));
  const compatibleB = normalizedB.every((column, bit) =>
    (column & ((2 ** bit) - 1)) === 0 && ((column >>> bit) & 1) === 1);
  assert.equal(compatibleB, true);

  const reanchorReceipts = targets.map((target, index) => {
    const result = invertWithReanchor(reanchorCache.query, reanchorBasis, target);
    assert.equal(result.preimage, secrets[index]);
    assert.equal(oracle(result.preimage), target);
    return { index, corrections: result.corrections, checks: result.checks };
  });
  assert.equal(reanchorCache.values.size, 115);
  assert.ok(reanchorReceipts.every((item) => item.corrections === 1 && item.checks === 2));

  const rankTwoCache = makeCache(oracle);
  const rankTwoBasis = prepareRankTwo(rankTwoCache.query);
  assert.equal(rankTwoBasis.nullity, 1);
  assert.equal(rankTwoBasis.orbitBound, 8);
  const rankTwoReceipts = targets.map((target, index) => {
    const result = invertWithRankTwo(rankTwoCache.query, rankTwoBasis, target);
    assert.equal(result.preimage, secrets[index]);
    assert.equal(oracle(result.preimage), target);
    return { index, orbitCalls: result.orbitCalls };
  });
  assert.deepEqual(rankTwoReceipts.map((item) => item.orbitCalls), [6, 7, 1, 7, 2, 7, 3, 7]);
  assert.equal(rankTwoCache.values.size, 73);

  console.log(JSON.stringify({
    result: 'PASS',
    sourceAudit: {
      affineRank: rankOfVectors(affineColumns),
      nonlinearOutputRank: rankOfVectors(nonlinearDirections),
      canonicalAnchorRank: rankOfVectors(Array.from({ length: 32 }, (_, bit) =>
        (oracle(2 ** bit) ^ oracle(0)) >>> 0)),
      successfulAnchor: '0xba8c2458',
      successfulAnchorCompatibleB: compatibleB,
    },
    reanchor: {
      failedAnchors: reanchorBasis.failed.map((item) => ({
        anchor: '0x' + item.anchor.toString(16),
        rank: item.rank,
        uniqueQueriesAfterAttempt: item.queryCount,
      })),
      attempts: reanchorBasis.attempts,
      perTarget: reanchorReceipts,
      uniqueOracleQueries: reanchorCache.values.size,
    },
    rankTwo: {
      rankBound: 2,
      affineNullity: rankTwoBasis.nullity,
      orbitBound: rankTwoBasis.orbitBound,
      perTarget: rankTwoReceipts,
      uniqueOracleQueries: rankTwoCache.values.size,
    },
  }, null, 2));
}

main();
