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
  return (
    (((input & 15) === 15) ? 1 : 0) ^
    (((input & 60) === 60) ? 2 : 0)
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
  assert.equal(fourthDerivative(rankSixSilentSource,directions),1);
  assert.equal(fourthDerivative(rankSixSilentSource,[4,8,16,32]),2);

  let drawCount = 0;
  const model = clone(
    rankSixSilentSource,
    6,
    () => /** @type {number} */ (directions[drawCount++]),
    1e-10
  );
  assert.equal(drawCount,4);
  assert.equal(model.degree,4);
  assert.equal(model.quotientRank,4);
  assert.deepEqual(model.quartic,[[15,1]]);

  // Independently determine the joint radical by checking all basis
  // three-tuples; multilinearity makes this exhaustive for each x.
  const triples = [];
  for (let a = 0; a < 6; a++) {
    for (let b = a + 1; b < 6; b++) {
      for (let c = b + 1; c < 6; c++) {
        triples.push([1 << a,1 << b,1 << c]);
      }
    }
  }
  let radicalCount = 0;
  for (let x = 0; x < 64; x++) {
    let inRadical = true;
    for (const triple of triples) {
      if (fourthDerivative(rankSixSilentSource,[x,...triple]) !== 0) {
        inRadical = false;
        break;
      }
    }
    if (inRadical) radicalCount++;
  }
  assert.equal(radicalCount,1);

  const mismatches = [];
  for (let input = 0; input < 64; input++) {
    if (rankSixSilentSource(input) !== evaluate(model,input)) mismatches.push(input);
  }
  assert.deepEqual(mismatches,[60,61,62,63]);
  assert.equal(rankSixSilentSource(60),2);
  assert.equal(evaluate(model,60),0);

  const result = {
    width:6,
    degree:4,
    jointRadicalSize:radicalCount,
    jointRadicalCodimension:6,
    promisedMaximumCodimension:5,
    observedSignatureRank:model.quotientRank,
    anchors:directions,
    reconstructedQuartic:model.quartic,
    mismatches,
    mismatchCount:mismatches.length,
    relativeDistance:mismatches.length/64,
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
