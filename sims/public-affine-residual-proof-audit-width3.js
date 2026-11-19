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
  const points = new Set([0]);
  for (const vector of basis(vectors)) {
    const prior = [...points];
    for (const point of prior) points.add(mask(point ^ vector));
  }
  return points;
}

/** @param {Set<number>} space @returns {number} */
function dimension(space) {
  const value = Math.log2(space.size);
  assert.ok(Number.isInteger(value), `subspace size ${space.size} is not a power of two`);
  return value;
}

/** @param {number[]} columns @param {number} input @returns {number} */
function applyLinear(columns, input) {
  let output = 0;
  for (let bit = 0; bit < WIDTH; bit += 1) {
    if (((input >>> bit) & 1) !== 0) output ^= columns[bit];
  }
  return mask(output);
}

/** @param {number[]} columns @param {number} rhs @returns {number|null} */
function solveFirst(columns, rhs) {
  const target = mask(rhs);
  for (let input = 0; input < SIZE; input += 1) {
    if (applyLinear(columns, input) === target) return input;
  }
  return null;
}

/** @param {Set<number>} left @param {Set<number>} right @returns {Set<number>} */
function intersection(left, right) {
  return new Set([...left].filter((value) => right.has(value)));
}

/** @param {Set<number>} left @param {Set<number>} right @returns {Set<number>} */
function xorSum(left, right) {
  const result = new Set();
  for (const a of left) {
    for (const b of right) result.add(mask(a ^ b));
  }
  return result;
}

/** @param {Set<number>} subset @param {Set<number>} superset */
function assertSubset(subset, superset) {
  for (const value of subset) assert.ok(superset.has(value), `missing value ${value}`);
}

/**
 * Independently validate the target-coset growth proof using only enumerated finite sets.
 * This deliberately avoids the production solver/intersection helpers.
 * @param {number[]} permutation
 * @param {number} target
 * @param {number[]} columns
 * @param {Set<number>} imageM
 * @param {Set<number>} residualSpace
 * @param {Set<number>} carrier
 * @param {Set<number>} kernel
 * @returns {{rounds:number,candidateInputs:number}}
 */
function auditTarget(permutation, target, columns, imageM, residualSpace, carrier, kernel) {
  const secret = permutation.indexOf(target);
  assert.ok(secret >= 0);

  let matchedInput = -1;
  for (let input = 0; input < SIZE; input += 1) {
    if (imageM.has(mask(permutation[input] ^ target))) {
      matchedInput = input;
      break;
    }
  }
  assert.ok(matchedInput >= 0, 'balanced quotient class must contain a match');

  const correction = solveFirst(columns, mask(permutation[matchedInput] ^ target));
  assert.notEqual(correction, null);
  const seed = mask(matchedInput ^ /** @type {number} */ (correction));
  assert.ok(carrier.has(mask(seed ^ secret)), 'phase-one correction must enter target carrier coset');

  let hSpace = new Set(kernel);
  const visited = new Set();
  let rounds = 0;

  while (true) {
    const outputs = new Set();
    const differences = [];
    let found = false;

    for (const h of hSpace) {
      const candidate = mask(seed ^ h);
      visited.add(candidate);
      const output = permutation[candidate];
      if (output === target) {
        found = true;
        break;
      }
      assert.ok(!outputs.has(output), 'permutation outputs in a failed scan must be distinct');
      outputs.add(output);
      differences.push(mask(output ^ target));
    }

    if (found) {
      assert.ok(visited.size <= carrier.size, 'nested candidate scans must fit inside the carrier coset');
      return {rounds, candidateInputs: visited.size};
    }

    assert.equal(differences.length, hSpace.size);
    assert.ok(differences.every((value) => value !== 0));
    assert.equal(new Set(differences).size, hSpace.size);

    const sSpace = spanSet(differences);
    assertSubset(sSpace, residualSpace);
    const hDim = dimension(hSpace);
    assert.ok(dimension(sSpace) >= hDim + 1, 'failed scan must raise observed residual dimension');

    const shared = intersection(sSpace, imageM);
    const preimage = new Set();
    for (let input = 0; input < SIZE; input += 1) {
      if (shared.has(applyLinear(columns, input))) preimage.add(input);
    }
    assertSubset(preimage, carrier);
    assert.ok(dimension(preimage) >= hDim + 1, 'preimage must contain a new carrier direction');

    const nextSpace = spanSet([...hSpace, ...preimage]);
    assertSubset(nextSpace, carrier);
    assert.ok(dimension(nextSpace) > hDim, 'carrier candidate subspace must strictly grow');
    hSpace = nextSpace;
    rounds += 1;
  }
}

/** @param {number[]} values @param {number} index @param {(permutation:number[])=>void} visit */
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
  const values = Array.from({length: SIZE}, (_, index) => index);
  const regimes = new Map();
  let permutations = 0;
  let targets = 0;
  let maxRounds = 0;
  let maxCandidateInputs = 0;
  let structuralChecks = 0;

  permute(values, 0, (permutation) => {
    permutations += 1;
    const c = permutation[0];
    const columns = Array.from({length: WIDTH}, (_, bit) => mask(permutation[1 << bit] ^ c));
    const imageM = spanSet(columns);
    const kernel = new Set(
      Array.from({length: SIZE}, (_, input) => input)
        .filter((input) => applyLinear(columns, input) === 0),
    );
    const residuals = permutation.map(
      (output, input) => mask(output ^ c ^ applyLinear(columns, input)),
    );
    const residualSpace = spanSet(residuals);
    const carrier = new Set(
      Array.from({length: SIZE}, (_, input) => input)
        .filter((input) => residualSpace.has(applyLinear(columns, input))),
    );

    const d = dimension(kernel);
    const r = dimension(residualSpace);
    const shared = intersection(residualSpace, imageM);

    assert.equal(xorSum(imageM, residualSpace).size, SIZE, 'image(M) + R must cover V');
    assert.ok(d <= r, 'nullity must not exceed residual rank');
    assert.equal(dimension(shared), r - d, 'dim(R intersect image(M)) must equal r-d');
    assert.equal(dimension(carrier), r, 'dim(M^-1(R)) must equal r');

    const quotientClassSize = SIZE / (2 ** d);
    const expectedDistinctSearch = (SIZE + 1) / (quotientClassSize + 1);
    assert.ok(expectedDistinctSearch <= 2 ** d, 'uniform distinct-search expectation must satisfy 2^d bound');
    structuralChecks += 1;

    for (let secret = 0; secret < SIZE; secret += 1) {
      const audit = auditTarget(
        permutation,
        permutation[secret],
        columns,
        imageM,
        residualSpace,
        carrier,
        kernel,
      );
      targets += 1;
      maxRounds = Math.max(maxRounds, audit.rounds);
      maxCandidateInputs = Math.max(maxCandidateInputs, audit.candidateInputs);
      const key = `${r}:${d}`;
      regimes.set(key, (regimes.get(key) ?? 0) + 1);
    }
  });

  console.log(JSON.stringify({
    width: WIDTH,
    permutations,
    targets,
    structuralChecks,
    maxRounds,
    maxCandidateInputs,
    regimes: Object.fromEntries([...regimes.entries()].sort()),
  }, null, 2));
}

main();
