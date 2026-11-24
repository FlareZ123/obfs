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
    result: 'all coefficients and evaluations matched'
  }, null, 2));
}
main();
