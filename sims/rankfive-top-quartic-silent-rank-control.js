'use strict';

const assert = require('node:assert/strict');
const {clone,evaluate} = require('./rankfive-top-quartic-functional-clone');

/** @param {number[]} directions @returns {()=>number} */
function fixedDirections(directions) {
  let index = 0;
  return () => /** @type {number} */ (directions[index++]);
}

/** @param {number} input @returns {number} */
function rankSixSilentSource(input) {
  const x = input & 0xff;
  return (
    x ^
    (((x & 15) === 15) ? 64 : 0) ^
    (((x & 60) === 60) ? 128 : 0)
  ) >>> 0;
}

/**
 * @param {(input:number)=>number} oracle
 * @param {number[]} directions
 * @returns {number}
 */
function fourthDerivative(oracle, directions) {
  let result = 0;
  for (let subset = 0; subset < 16; subset++) {
    let input = 0;
    for (let bit = 0; bit < 4; bit++) {
      if (((subset >>> bit) & 1) !== 0) input ^= directions[bit];
    }
    result ^= oracle(input);
  }
  return result >>> 0;
}

/** @returns {object} */
function main() {
  const directions = [1, 2, 4, 8];
  assert.equal(fourthDerivative(rankSixSilentSource,directions),64);
  assert.equal(fourthDerivative(rankSixSilentSource,[4,8,16,32]),128);

  let drawCount = 0;
  const model = clone(
    rankSixSilentSource,
    8,
    () => /** @type {number} */ (directions[drawCount++]),
    1e-10
  );
  assert.equal(drawCount,4);
  assert.equal(model.degree,4);
  assert.equal(model.quotientRank,4);
  assert.deepEqual(model.quartic,[[15,64]]);

  // Independently determine the joint radical by checking all basis
  // three-tuples; multilinearity makes this exhaustive for each x.
  /** @type {number[][]} */
  const triples = [];
  for (let a = 0; a < 6; a++) {
    for (let b = a + 1; b < 6; b++) {
      for (let c = b + 1; c < 6; c++) {
        triples.push([1 << a,1 << b,1 << c]);
      }
    }
  }
  let radicalCount = 0;
  for (let x = 0; x < 256; x++) {
    let inRadical = true;
    for (const triple of triples) {
      if (fourthDerivative(rankSixSilentSource,[x,...triple]) !== 0) {
        inRadical = false;
        break;
      }
    }
    if (inRadical) radicalCount++;
  }
  assert.equal(radicalCount,4);

  /** @type {Set<number>} */
  const outputs = new Set();
  for (let input = 0; input < 256; input++) outputs.add(rankSixSilentSource(input));
  assert.equal(outputs.size,256,'the source control must be a permutation');

  /** @type {number[]} */
  const mismatches = [];
  for (let input = 0; input < 256; input++) {
    if (rankSixSilentSource(input) !== evaluate(model,input)) mismatches.push(input);
  }
  assert.equal(mismatches.length,16);
  assert.ok(mismatches.every(input => (input & 60) === 60));
  assert.equal(rankSixSilentSource(60),188);
  assert.equal(evaluate(model,60),60);

  const result = {
    width:8,
    degree:4,
    sourceIsPermutation:true,
    jointRadicalSize:radicalCount,
    jointRadicalCodimension:8 - Math.log2(radicalCount),
    promisedMaximumCodimension:5,
    observedSignatureRank:model.quotientRank,
    anchors:directions,
    reconstructedQuartic:model.quartic,
    mismatches,
    mismatchCount:mismatches.length,
    relativeDistance:mismatches.length/256,
    sourceAt60:rankSixSilentSource(60),
    cloneAt60:evaluate(model,60),
    distinctOracleQueries:model.queries,
    conclusion:'The codimension<=5 signature-span check silently accepts this codimension-6 source and omits its second quartic monomial.'
  };
  console.log('RANKFIVE_TOP_QUARTIC_SILENT_RANK_CONTROL ' + JSON.stringify(result));
  return result;
}

if (require.main === module) main();
module.exports = {main,rankSixSilentSource,fourthDerivative};
