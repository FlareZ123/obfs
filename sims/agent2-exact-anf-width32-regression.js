'use strict';
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');

// Verbatim extraction of masksOfWeight, exactDegreeFiveModel, and
// evaluateHybridModel from peer blob b602c4ab14d64782689a42e2bd349c4b5be53c6c.
const PEER_SOURCE_BLOB = 'b602c4ab14d64782689a42e2bd349c4b5be53c6c';

/** @param {number} n @param {number} weight @returns {number[]} */
function masksOfWeight(n, weight) {
  /** @type {number[]} */
  const result = [];
  /** @param {number} from @param {number} remaining @param {number} value */
  function visit(from, remaining, value) {
    if (remaining === 0) {
      result.push(value >>> 0);
      return;
    }
    for (let bit = from; bit <= n - remaining; bit++) {
      visit(bit + 1, remaining - 1, value ^ (1 << bit));
    }
  }
  visit(0, weight, 0);
  return result;
}

/**
 * Exact degree-five ANF fallback, copied from the reviewed peer implementation.
 * @param {(input:number)=>number} ask
 * @param {number} n
 * @returns {{kind:'anf',bits:number,lower:Array<[number,number]>,top:Array<[number,number]>,degree:4|5}}
 */
function exactDegreeFiveModel(ask, n) {
  /** @type {Map<number,number>} */
  const coefficients = new Map();
  for (let weight = 0; weight <= 4; weight++) {
    for (const input of masksOfWeight(n, weight)) {
      let coefficient = ask(input) >>> 0;
      if (input !== 0) {
        for (let subset = ((input - 1) & input); ; subset = ((subset - 1) & input)) {
          coefficient ^= /** @type {number} */ (coefficients.get(subset >>> 0));
          if (subset === 0) break;
        }
      }
      coefficients.set(input >>> 0, coefficient >>> 0);
    }
  }

  /** @type {Array<[number,number]>} */
  const lower = Array.from(coefficients.entries()).filter(([,value]) => value !== 0);
  /** @type {Array<[number,number]>} */
  const top = [];
  for (const support of masksOfWeight(n, 5)) {
    let coefficient = ask(support) >>> 0;
    for (let subset = ((support - 1) & support); ; subset = ((subset - 1) & support)) {
      coefficient ^= /** @type {number} */ (coefficients.get(subset >>> 0));
      if (subset === 0) break;
    }
    if (coefficient !== 0) top.push([support >>> 0, coefficient >>> 0]);
  }
  return {kind:'anf',bits:n,lower,top,degree:top.length > 0 ? 5 : 4};
}

/** @param {{bits:number,lower:Array<[number,number]>,top:Array<[number,number]>}} model @param {number} input @returns {number} */
function evaluateHybridModel(model, input) {
  const mask = model.bits === 32 ? 0xffffffff : (2 ** model.bits - 1);
  const x = (input & mask) >>> 0;
  let result = 0;
  for (const [support,coefficient] of model.lower) {
    if (((x & support) >>> 0) === support) result ^= coefficient;
  }
  for (const [support,coefficient] of model.top) {
    if (((x & support) >>> 0) === support) result ^= coefficient;
  }
  return result >>> 0;
}

function word(label) {
  return createHash('sha256').update(label).digest().readUInt32BE(0);
}
function makeSparseDegreeFiveSource() {
  const supports = [
    0x00000000, 0x00000001, 0x80000000, 0x20000000, 0x00000080,
    0x80000001, 0x80000008, 0x98000000, 0x60000000,
    0x80000003, 0xe0000000, 0x90000001,
    0x80000007, 0xf0000000,
    0xf8000000, 0x88000007, 0x80000017,
    0x0000001f, 0x78000000, 0xc000001c,
    0x8000000f, 0x70000003, 0xf0000001,
    0x8800000b, 0x78000001
  ];
  const terms = supports.map((support, i) => [support >>> 0, word('width32-anf-term/' + i)]);
  const oracle = input => {
    const x = input >>> 0;
    let result = 0;
    for (const [support, coefficient] of terms) {
      if (((x & support) >>> 0) === support) result ^= coefficient;
    }
    return result >>> 0;
  };
  return { terms, oracle };
}

function popcount32(value) {
  let x = value >>> 0;
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  x = (x + (x >>> 4)) & 0x0f0f0f0f;
  x += x >>> 8;
  x += x >>> 16;
  return x & 0x3f;
}
function makeDenseDegreeFiveSource() {
  const coefficients = new Map();
  for (let weight = 0; weight <= 5; weight++) {
    for (const support of masksOfWeight(32, weight)) {
      let coefficient = word('width32-dense-anf/' + support);
      if (coefficient === 0) coefficient = 1;
      coefficients.set(support >>> 0, coefficient >>> 0);
    }
  }
  const oracle = input => {
    const x = input >>> 0;
    let result = 0;
    for (let subset = x; ; subset = ((subset - 1) & x)) {
      if (popcount32(subset) <= 5) result ^= coefficients.get(subset >>> 0) || 0;
      if (subset === 0) break;
    }
    return result >>> 0;
  };
  return { coefficients, oracle };
}
function runDenseRegression() {
  const { coefficients, oracle } = makeDenseDegreeFiveSource();
  const cache = new Map();
  const ask = input => {
    const x = input >>> 0;
    if (!cache.has(x)) cache.set(x, oracle(x));
    return cache.get(x);
  };
  const model = exactDegreeFiveModel(ask, 32);
  assert.equal(cache.size, 242825);
  const recovered = new Map([...model.lower, ...model.top].map(([support, coefficient]) => [support >>> 0, coefficient >>> 0]));
  const expected = new Map([...coefficients].filter(([, coefficient]) => coefficient !== 0));
  assert.equal(recovered.size, expected.size);
  for (const [support, coefficient] of expected) assert.equal(recovered.get(support), coefficient);
  for (let i = 0; i < 100; i++) {
    const input = word('width32-dense-holdout/' + i);
    assert.equal(evaluateHybridModel(model, input), oracle(input));
  }
  return { queries: cache.size, coefficients: recovered.size, holdouts: 100 };
}

function runPrefilledCacheRegression() {
  const { oracle } = makeSparseDegreeFiveSource();
  const cache = new Map();
  const basisPoints = Array.from({ length: 10 }, (_, i) => i);
  const outsidePoints = [];
  for (let i = 0; outsidePoints.length < 5; i++) {
    const candidate = word('width32-precache-outside/' + i);
    if (popcount32(candidate) > 5) outsidePoints.push(candidate);
  }
  for (const point of [...basisPoints, ...outsidePoints]) cache.set(point >>> 0, oracle(point));
  const initialSize = cache.size;
  const ask = input => {
    const x = input >>> 0;
    if (!cache.has(x)) cache.set(x, oracle(x));
    return cache.get(x);
  };
  const model = exactDegreeFiveModel(ask, 32);
  const incrementalQueries = cache.size - initialSize;
  assert.equal(initialSize, 15);
  assert.equal(cache.size, 242830);
  assert.equal(incrementalQueries, 242815);
  for (let i = 0; i < 100; i++) {
    const input = word('width32-precache-holdout/' + i);
    assert.equal(evaluateHybridModel(model, input), oracle(input));
  }
  return { initial_cached: initialSize, prefilled_in_basis: basisPoints.length, prefilled_outside_basis: outsidePoints.length, total_distinct_queries: cache.size, incremental_fallback_queries: incrementalQueries, holdouts: 100 };
}

function main() {
  const n = 32;
  const { terms, oracle } = makeSparseDegreeFiveSource();
  const cache = new Map();
  const ask = input => {
    const x = input >>> 0;
    if (!cache.has(x)) cache.set(x, oracle(x));
    return cache.get(x);
  };
  const model = exactDegreeFiveModel(ask, n);
  assert.equal(model.kind, 'anf');
  assert.equal(model.bits, 32);
  assert.equal(model.degree, 5);
  assert.equal(cache.size, 242825);

  const expected = new Map(terms.map(([support, coefficient]) => [support >>> 0, coefficient >>> 0]));
  const recovered = new Map([...model.lower, ...model.top].map(([support, coefficient]) => [support >>> 0, coefficient >>> 0]));
  assert.equal(recovered.size, expected.size);
  for (const [support, coefficient] of expected) {
    assert.equal(recovered.get(support), coefficient, 'coefficient mismatch at 0x' + support.toString(16));
  }

  const probes = [0, 1, 0x80000000, 0xffffffff, 0x80000001, 0xf8000000, 0x7fffffff];
  for (const input of probes) assert.equal(evaluateHybridModel(model, input), oracle(input));
  for (let i = 0; i < 10000; i++) {
    const input = word('width32-anf-test/' + i);
    assert.equal(evaluateHybridModel(model, input), oracle(input));
  }
  const dense = runDenseRegression();
  const precached = runPrefilledCacheRegression();

  console.log(JSON.stringify({
    node: process.version,
    peer_source_blob: PEER_SOURCE_BLOB,
    width: n,
    exact_degree: 5,
    nonzero_terms: terms.length,
    recovered_lower_terms: model.lower.length,
    recovered_top_terms: model.top.length,
    distinct_interpolation_queries: cache.size,
    expected_interpolation_queries: 242825,
    edge_probes: probes.length,
    random_holdouts: 10000,
    dense_regression: dense,
    prefilled_cache_regression: precached,
    result: 'all coefficients and evaluations matched'
  }, null, 2));
}
main();
