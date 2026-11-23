'use strict';

const assert = require('node:assert/strict');
const {learn,evaluate} = require('./rankfour-projected-cubic-rescue');

/** @param {number} input @returns {number} */
function silentRankFivePermutationSource(input) {
  const x = input & 0x7f;
  return (
    x ^
    (((x & 7) === 7) ? 32 : 0) ^
    (((x & 28) === 28) ? 64 : 0)
  ) >>> 0;
}

/** @returns {()=>number} */
function forcedAnchorDirections() {
  const directions = [1,2,4];
  let index = 0;
  return () => /** @type {number} */ (directions[index++]);
}

/**
 * Alternating third derivative of a vector Boolean function.
 * @param {(input:number)=>number} oracle
 * @param {number[]} directions
 * @returns {number}
 */
function thirdDerivative(oracle,directions) {
  let result = 0;
  for (let subset = 0; subset < 8; subset++) {
    let input = 0;
    for (let bit = 0; bit < 3; bit++) {
      if (((subset >>> bit) & 1) !== 0) input ^= directions[bit];
    }
    result ^= oracle(input);
  }
  return result >>> 0;
}

/** @returns {object} */
function main() {
  const source = silentRankFivePermutationSource;
  const anchors = [1,2,4];
  assert.equal(thirdDerivative(source,anchors),32);
  assert.equal(thirdDerivative(source,[4,8,16]),64);

  const model = learn(source,7,forcedAnchorDirections(),1e-10);
  assert.equal(model.degree,3);
  assert.deepEqual(model.projected,[1,2,4,0,0,0,0]);
  assert.equal(model.cubic[7],32);

  /** @type {number[][]} */
  const pairs = [];
  for (let a = 0; a < 7; a++) {
    for (let b = a + 1; b < 7; b++) pairs.push([1 << a,1 << b]);
  }
  let jointRadicalSize = 0;
  for (let x = 0; x < 128; x++) {
    let inRadical = true;
    for (const pair of pairs) {
      if (thirdDerivative(source,[x,...pair]) !== 0) {
        inRadical = false;
        break;
      }
    }
    if (inRadical) jointRadicalSize++;
  }
  assert.equal(jointRadicalSize,4);

  /** @type {Set<number>} */
  const sourceOutputs = new Set();
  /** @type {Set<number>} */
  const cloneOutputs = new Set();
  /** @type {number[]} */
  const mismatches = [];
  for (let input = 0; input < 128; input++) {
    const expected = source(input);
    const actual = evaluate(model,input);
    sourceOutputs.add(expected);
    cloneOutputs.add(actual);
    if (expected !== actual) mismatches.push(input);
  }
  assert.equal(sourceOutputs.size,128);
  assert.equal(cloneOutputs.size,128);
  assert.equal(mismatches.length,16);
  assert.ok(mismatches.every(input => (input & 28) === 28));
  assert.equal(source(28),92);
  assert.equal(evaluate(model,28),28);

  const result = {
    width:7,
    degree:3,
    sourceAndCandidateArePermutations:true,
    jointRadicalSize,
    jointRadicalCodimension:5,
    promisedMaximumProjectionRank:4,
    observedProjectedCoordinates:model.projected,
    observedSignatureRank:3,
    sourceAt28:source(28),
    cloneAt28:evaluate(model,28),
    mismatches,
    mismatchCount:mismatches.length,
    relativeDistance:mismatches.length/128,
    queries:model.queries,
    conclusion:'The rank-four projected cubic learner silently accepts a rank-three projection from the standard-basis signatures, then its quadratic residual learner omits the second cubic monomial.'
  };
  console.log('RANKFOUR_PROJECTED_CUBIC_SILENT_RANK_CONTROL ' + JSON.stringify(result));
  return result;
}

if (require.main === module) main();
module.exports = {main,silentRankFivePermutationSource,thirdDerivative};
