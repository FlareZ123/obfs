'use strict';

const assert = require('node:assert/strict');

/** @param {number} seed @returns {()=>number} */
function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
}

/** @param {number[]} columns @param {number} word @returns {number} */
function apply(columns, word) {
  let output = 0;
  for (let bit = 0; bit < columns.length; bit++) {
    if ((word >>> bit) & 1) output ^= columns[bit];
  }
  return output >>> 0;
}

/** @param {()=>number} draw @returns {number[]} */
function invertibleColumns(draw) {
  const columns = Array.from({length: 32}, (_, i) => (1 << i) >>> 0);
  for (let i = 0; i < 256; i++) {
    const a = draw() % 32;
    let b = draw() % 31;
    if (b >= a) b++;
    columns[a] = (columns[a] ^ columns[b]) >>> 0;
    if ((draw() & 7) === 0) {
      const value = columns[a];
      columns[a] = columns[b];
      columns[b] = value;
    }
  }
  return columns;
}

/** @param {bigint} value @returns {number} */
function parityBig(value) {
  let parity = 0;
  while (value !== 0n) {
    parity ^= 1;
    value &= value - 1n;
  }
  return parity;
}

/**
 * Exhaustively solve the entire affine GF(2) preimage of a 32x32
 * matrix, including rank-deficient cases. Return each distinct solution.
 *
 * @param {number[]} columns
 * @param {number} target
 * @returns {number[]}
 */
function inverseImage(columns, target) {
  /** @type {{mask:bigint,rhs:number}[]} */
  const rows = [];
  for (let bit = 0; bit < 32; bit++) {
    let mask = 0n;
    for (let column = 0; column < 32; column++) {
      if ((columns[column] >>> bit) & 1) mask |= 1n << BigInt(column);
    }
    rows.push({mask, rhs: (target >>> bit) & 1});
  }

  /** @type {number[]} */
  const pivots = [];
  let active = 0;
  for (let column = 0; column < 32 && active < 32; column++) {
    const bit = 1n << BigInt(column);
    let pivot = active;
    while (pivot < 32 && (rows[pivot].mask & bit) === 0n) pivot++;
    if (pivot === 32) continue;
    const old = rows[active];
    rows[active] = rows[pivot];
    rows[pivot] = old;
    for (let i = 0; i < 32; i++) {
      if (i !== active && (rows[i].mask & bit) !== 0n) {
        rows[i].mask ^= rows[active].mask;
        rows[i].rhs ^= rows[active].rhs;
      }
    }
    pivots.push(column);
    active++;
  }

  for (let row = active; row < 32; row++) {
    if (rows[row].rhs !== 0) return [];
  }
  /** @type {number[]} */
  const free = [];
  for (let i = 0; i < 32; i++) if (!pivots.includes(i)) free.push(i);
  assert.ok(free.length <= 2, 'Expected at most two null directions');

  /** @type {number[]} */
  const results = [];
  for (let assignment = 0; assignment < 2 ** free.length; assignment++) {
    let solution = 0n;
    for (let i = 0; i < free.length; i++) {
      if ((assignment >>> i) & 1) solution |= 1n << BigInt(free[i]);
    }
    for (let i = 0; i < active; i++) {
      const value = rows[i].rhs ^ parityBig(rows[i].mask & solution);
      if (value) solution |= 1n << BigInt(pivots[i]);
    }
    const value = Number(solution & 0xffffffffn) >>> 0;
    assert.equal(apply(columns, value), target >>> 0);
    results.push(value);
  }
  return results;
}

/**
 * Construct a randomly affine-wrapped, explicitly noninjective 32-bit
 * rank-two-input/rank-two-output correction. Canonical inner function
 * H has output bits (x0*x1, 0, x2, ..., x31). Output bit one is never set.
 *
 * @param {()=>number} draw
 * @returns {{oracle:(x:number)=>number,unreachable:()=>number}}
 */
function makeInstance(draw) {
  const inputMatrix = invertibleColumns(draw);
  const outputMatrix = invertibleColumns(draw);
  const inputOffset = draw(), outputOffset = draw();
  return {
    oracle(x) {
      const original = (apply(inputMatrix, x) ^ inputOffset) >>> 0;
      const nonlinear = (((original & 1) * ((original >>> 1) & 1)) |
        (original & 0xfffffffc)) >>> 0;
      return (apply(outputMatrix, nonlinear) ^ outputOffset) >>> 0;
    },
    unreachable() {
      const impossible = (draw() | 2) >>> 0;
      return (apply(outputMatrix, impossible) ^ outputOffset) >>> 0;
    }
  };
}

/**
 * An attacker is given only the forward oracle and a claimed rank-two
 * output displacement and rank-two input projection. No hidden matrices,
 * offsets, or target preimages are available to this algorithm.
 *
 * @param {(x:number)=>number} oracle
 * @param {()=>number} draw
 * @returns {{classify:(target:number)=>{preimage:number|null,candidates:number,additionalQueries:number},
 *   preparationQueries:number,seen:Map<number,number>,interpolation:number[]}}
 */
function prepare(oracle, draw) {
  /** @type {Map<number,number>} */
  const seen = new Map();
  /** @param {number} x @returns {number} */
  function ask(x) {
    const key = x >>> 0;
    if (!seen.has(key)) seen.set(key, oracle(key) >>> 0);
    return /** @type {number} */ (seen.get(key));
  }
  const c = ask(0);
  const interpolation = Array.from({length: 32}, (_, i) =>
    (ask((1 << i) >>> 0) ^ c) >>> 0);
  /** @type {number} */
  let residualBasis = 0;
  for (let i = 0; i < 81; i++) {
    const x = draw();
    const residual = (ask(x) ^ c ^ apply(interpolation, x)) >>> 0;
    if (residual !== 0) {
      if (residualBasis !== 0) assert.equal(residual, residualBasis);
      residualBasis = residual;
    }
  }
  const preparationQueries = seen.size;
  assert.ok(preparationQueries <= 33 + 81);

  /** @param {number} target */
  function classify(target) {
    const prior = seen.size;
    const shift = (target ^ c) >>> 0;
    const candidates = inverseImage(interpolation, shift);
    if (residualBasis !== 0) {
      for (const x of inverseImage(interpolation, shift ^ residualBasis)) {
        assert.ok(!candidates.includes(x));
        candidates.push(x);
      }
    }
    assert.ok(candidates.length <= 4);
    for (const x of candidates) {
      if (ask(x) === (target >>> 0)) {
        const additionalQueries = seen.size - prior;
        assert.ok(additionalQueries <= 4);
        return {preimage: x, candidates: candidates.length, additionalQueries};
      }
    }
    const additionalQueries = seen.size - prior;
    assert.ok(additionalQueries <= 4);
    return {preimage: null, candidates: candidates.length, additionalQueries};
  }
  return {classify, preparationQueries, seen, interpolation};
}

/** @returns {void} */
function main() {
  const params = seeded(0x4510a335);
  let reached = 0, unreachable = 0, maxCandidates = 0;
  let maxPreparationQueries = 0, maxPerTargetQueries = 0;
  let maxTotalOneTarget = 0, observedSingular = 0, cases = 0;
  for (let trial = 0; trial < 96; trial++) {
    const instance = makeInstance(params);
    const attackerDraw = seeded((0x91ac03f2 ^ trial * 0x9e3779b9) >>> 0);
    const attack = prepare(instance.oracle, attackerDraw);
    maxPreparationQueries = Math.max(maxPreparationQueries, attack.preparationQueries);
    const nullity = Math.log2(inverseImage(attack.interpolation, 0).length);
    assert.ok(Number.isInteger(nullity) && nullity <= 2);
    if (nullity > 0) observedSingular++;
    for (let i = 0; i < 8; i++) {
      const secret = params();
      const target = instance.oracle(secret);
      const result = attack.classify(target);
      assert.notEqual(result.preimage, null, 'A reachable target was rejected');
      assert.equal(instance.oracle(/** @type {number} */ (result.preimage)), target);
      maxCandidates = Math.max(maxCandidates, result.candidates);
      maxPerTargetQueries = Math.max(maxPerTargetQueries, result.additionalQueries);
      maxTotalOneTarget = Math.max(maxTotalOneTarget,
        attack.preparationQueries + result.additionalQueries);
      reached++;
    }
    for (let i = 0; i < 8; i++) {
      const target = instance.unreachable();
      const result = attack.classify(target);
      assert.equal(result.preimage, null, 'Unreachable target was accepted');
      maxCandidates = Math.max(maxCandidates, result.candidates);
      maxPerTargetQueries = Math.max(maxPerTargetQueries, result.additionalQueries);
      maxTotalOneTarget = Math.max(maxTotalOneTarget,
        attack.preparationQueries + result.additionalQueries);
      unreachable++;
    }
    cases++;
  }
  assert.equal(reached, 768);
  assert.equal(unreachable, 768);
  assert.ok(observedSingular > 0);
  assert.ok(maxTotalOneTarget <= 118);
  console.log(JSON.stringify({
    width: 32, seed: '0x4510a335',training: 81,
    rankInputBound: 2,rankOutputBound: 2,
    cases,reached,unreachable,
    observedSingular,maxCandidates,
    maxPreparationQueries,maxPerTargetQueries,maxTotalOneTarget,
    formalQueryCap: 118, scope:
    'Affine-wrapped noninjective rank-two-projection family with oracle-only attacker; deterministic sample transcript is a test, not probabilistic proof'
  }, null, 2));
}
if (require.main === module) main();
module.exports = {main,prepare,inverseImage};
