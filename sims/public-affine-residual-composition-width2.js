'use strict';

const assert = require('node:assert/strict');

const WIDTH = 2;
const SIZE = 1 << WIDTH;

/** @param {number} value @returns {number} */
function mask(value) {
  return value & (SIZE - 1);
}

/** @param {number[]} vectors @returns {number[]} */
function basis(vectors) {
  const pivots = Array(WIDTH).fill(0);
  const result = [];
  for (const original of vectors) {
    let value = mask(original);
    for (let bit = WIDTH - 1; bit >= 0 && value !== 0; bit -= 1) {
      if (((value >>> bit) & 1) === 0) continue;
      if (pivots[bit] !== 0) {
        value ^= pivots[bit];
      } else {
        pivots[bit] = value;
        result.push(mask(original));
        break;
      }
    }
  }
  return result;
}

/** @param {number[]} vectors @returns {Set<number>} */
function spanSet(vectors) {
  const result = new Set([0]);
  for (const vector of basis(vectors)) {
    for (const prior of [...result]) result.add(mask(prior ^ vector));
  }
  return result;
}

/** @param {number[]} columns @param {number} input @returns {number} */
function applyLinear(columns, input) {
  let output = 0;
  for (let bit = 0; bit < WIDTH; bit += 1) {
    if (((input >>> bit) & 1) !== 0) output ^= columns[bit];
  }
  return mask(output);
}

/**
 * @param {number[]} fn
 * @returns {{constant:number,columns:number[],residualBasis:number[],rank:number}}
 */
function residualData(fn) {
  const constant = fn[0];
  const columns = Array.from(
    {length: WIDTH},
    (_, bit) => mask(fn[1 << bit] ^ constant),
  );
  const residualBasis = basis(fn.map(
    (output, input) => mask(output ^ constant ^ applyLinear(columns, input)),
  ));
  return {constant, columns, residualBasis, rank: residualBasis.length};
}

/** @param {number[]} outer @param {number[]} inner @returns {number[]} */
function compose(outer, inner) {
  return inner.map((value) => outer[value]);
}

/** @param {number} id @returns {number[]} */
function decodeFunction(id) {
  return Array.from(
    {length: SIZE},
    (_, input) => (id >>> (WIDTH * input)) & (SIZE - 1),
  );
}

function main() {
  const functions = Array.from({length: SIZE ** SIZE}, (_, id) => decodeFunction(id));
  const data = functions.map(residualData);
  let pairs = 0;
  let tightRankBounds = 0;
  let maxCompositionRank = 0;
  const regimes = new Map();

  for (let innerId = 0; innerId < functions.length; innerId += 1) {
    const inner = functions[innerId];
    const innerData = data[innerId];
    for (let outerId = 0; outerId < functions.length; outerId += 1) {
      const outer = functions[outerId];
      const outerData = data[outerId];
      const combined = residualData(compose(outer, inner));

      const transportedInner = innerData.residualBasis.map(
        (vector) => applyLinear(outerData.columns, vector),
      );
      const witnessBasis = basis([
        ...outerData.residualBasis,
        ...transportedInner,
      ]);
      const witnessSpan = spanSet(witnessBasis);

      for (const vector of combined.residualBasis) {
        assert.ok(
          witnessSpan.has(vector),
          'composition residual must lie in R_outer + L_outer(R_inner)',
        );
      }
      assert.ok(combined.rank <= witnessBasis.length);
      assert.ok(witnessBasis.length <= outerData.rank + innerData.rank);

      pairs += 1;
      maxCompositionRank = Math.max(maxCompositionRank, combined.rank);
      if (combined.rank === Math.min(WIDTH, outerData.rank + innerData.rank)) {
        tightRankBounds += 1;
      }
      const key = `${innerData.rank}+${outerData.rank}->${combined.rank}`;
      regimes.set(key, (regimes.get(key) ?? 0) + 1);
    }
  }

  console.log(JSON.stringify({
    width: WIDTH,
    functions: functions.length,
    pairs,
    tightRankBounds,
    maxCompositionRank,
    regimes: Object.fromEntries([...regimes.entries()].sort()),
  }, null, 2));
}

main();
