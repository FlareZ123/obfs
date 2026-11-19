'use strict';

const assert = require('node:assert/strict');

const WIDTH = 3;
const SIZE = 1 << WIDTH;

/** @param {number[]} columns @returns {number} */
function rank(columns) {
  const pivots = Array(WIDTH).fill(0);
  let count = 0;
  for (const raw of columns) {
    let value = raw;
    for (let bit = WIDTH - 1; bit >= 0; bit -= 1) {
      if (((value >>> bit) & 1) === 0) continue;
      if (pivots[bit] !== 0) value ^= pivots[bit];
      else {
        pivots[bit] = value;
        count += 1;
        break;
      }
    }
  }
  return count;
}

/** @param {number[]} columns @param {number} input @returns {number} */
function applyLinear(columns, input) {
  let output = 0;
  for (let bit = 0; bit < WIDTH; bit += 1) {
    if (((input >>> bit) & 1) !== 0) output ^= columns[bit];
  }
  return output;
}

/** @param {number[]} columns @returns {number[]} */
function inverseTable(columns) {
  const inverse = Array(SIZE).fill(-1);
  for (let input = 0; input < SIZE; input += 1) {
    inverse[applyLinear(columns, input)] = input;
  }
  assert.ok(inverse.every((value) => value >= 0));
  return inverse;
}

/**
 * @param {number[]} values
 * @param {number} index
 * @param {(permutation:number[])=>void} visit
 */
function enumeratePermutations(values, index, visit) {
  if (index === values.length) {
    visit(values);
    return;
  }
  for (let swap = index; swap < values.length; swap += 1) {
    [values[index], values[swap]] = [values[swap], values[index]];
    enumeratePermutations(values, index + 1, visit);
    [values[index], values[swap]] = [values[swap], values[index]];
  }
}

function main() {
  let permutations = 0;
  let fullRank = 0;
  let singular = 0;
  let recoveredTargets = 0;
  let maxCycleLength = 0;

  enumeratePermutations(
    Array.from({length: SIZE}, (_, value) => value),
    0,
    (permutation) => {
      permutations += 1;
      const base = permutation[0];
      const columns = Array.from(
        {length: WIDTH},
        (_, bit) => permutation[1 << bit] ^ base,
      );

      if (rank(columns) !== WIDTH) {
        singular += 1;
        return;
      }

      fullRank += 1;
      const inverse = inverseTable(columns);
      const transformed = Array.from(
        {length: SIZE},
        (_, input) => inverse[permutation[input] ^ base],
      );
      assert.equal(new Set(transformed).size, SIZE);

      for (let secret = 0; secret < SIZE; secret += 1) {
        const target = transformed[secret];
        let current = target;
        let recovered = -1;

        for (let step = 1; step <= SIZE; step += 1) {
          const next = transformed[current];
          if (next === target) {
            recovered = current;
            maxCycleLength = Math.max(maxCycleLength, step);
            break;
          }
          current = next;
        }

        assert.equal(recovered, secret);
        recoveredTargets += 1;
      }
    },
  );

  assert.equal(permutations, 40320);
  assert.equal(fullRank, 32256);
  assert.equal(singular, 8064);
  assert.equal(recoveredTargets, 258048);
  assert.equal(maxCycleLength, 4);

  console.log(JSON.stringify({
    width: WIDTH,
    nonlinearSubspaceDimension: WIDTH,
    permutations,
    fullRank,
    singular,
    recoveredTargets,
    maxCycleLength,
    theoremCycleBound: SIZE,
    result: 'all full-rank targets recovered exactly',
  }));
}

if (require.main === module) main();
