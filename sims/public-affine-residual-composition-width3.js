'use strict';

const assert = require('node:assert/strict');

const WIDTH = 3;
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
 * @returns {{columns:number[],residualBasis:number[],rank:number}}
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
  return {columns, residualBasis, rank: residualBasis.length};
}

/** @param {number[]} outer @param {number[]} inner @returns {number[]} */
function compose(outer, inner) {
  return inner.map((value) => outer[value]);
}

/**
 * @param {number[]} outer
 * @param {{columns:number[],residualBasis:number[],rank:number}} outerData
 * @param {number[]} inner
 * @param {{columns:number[],residualBasis:number[],rank:number}} innerData
 * @returns {number}
 */
function auditComposition(outer, outerData, inner, innerData) {
  const combined = residualData(compose(outer, inner));
  const transported = innerData.residualBasis.map(
    (vector) => applyLinear(outerData.columns, vector),
  );
  const witnessBasis = basis([...outerData.residualBasis, ...transported]);
  const witnessSpan = spanSet(witnessBasis);
  for (const vector of combined.residualBasis) {
    assert.ok(witnessSpan.has(vector));
  }
  assert.ok(combined.rank <= witnessBasis.length);
  assert.ok(witnessBasis.length <= outerData.rank + innerData.rank);
  return combined.rank;
}

/**
 * @param {number[]} values
 * @param {number} index
 * @param {(permutation:number[])=>void} visit
 */
function permute(values, index, visit) {
  if (index === values.length) {
    visit(values);
    return;
  }
  for (let swap = index; swap < values.length; swap += 1) {
    [values[index], values[swap]] = [values[swap], values[index]];
    permute(values, index + 1, visit);
    [values[index], values[swap]] = [values[swap], values[index]];
  }
}

function main() {
  /** @type {number[][]} */
  const permutations = [];
  permute(Array.from({length: SIZE}, (_, index) => index), 0, (permutation) => {
    permutations.push(permutation.slice());
  });

  const data = permutations.map(residualData);
  /** @type {Map<number, number>} */
  const representativeByRank = new Map();
  for (let index = 0; index < data.length; index += 1) {
    if (!representativeByRank.has(data[index].rank)) {
      representativeByRank.set(data[index].rank, index);
    }
  }
  assert.deepEqual([...representativeByRank.keys()].sort(), [0, 1, 2, 3]);

  let pairs = 0;
  let maxCompositionRank = 0;
  const regimes = new Map();

  for (let index = 0; index < permutations.length; index += 1) {
    for (const representativeIndex of representativeByRank.values()) {
      const leftRank = auditComposition(
        permutations[representativeIndex],
        data[representativeIndex],
        permutations[index],
        data[index],
      );
      const rightRank = auditComposition(
        permutations[index],
        data[index],
        permutations[representativeIndex],
        data[representativeIndex],
      );
      maxCompositionRank = Math.max(maxCompositionRank, leftRank, rightRank);
      const leftKey = `${data[index].rank}+${data[representativeIndex].rank}->${leftRank}`;
      const rightKey = `${data[representativeIndex].rank}+${data[index].rank}->${rightRank}`;
      regimes.set(leftKey, (regimes.get(leftKey) ?? 0) + 1);
      regimes.set(rightKey, (regimes.get(rightKey) ?? 0) + 1);
      pairs += 2;
    }
  }

  console.log(JSON.stringify({
    width: WIDTH,
    permutations: permutations.length,
    representativeRanks: [...representativeByRank.keys()].sort(),
    pairs,
    maxCompositionRank,
    regimes: Object.fromEntries([...regimes.entries()].sort()),
  }, null, 2));
}

main();
