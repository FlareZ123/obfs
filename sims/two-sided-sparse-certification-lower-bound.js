'use strict';

const WIDTH = 8;
const SIZE = 1 << WIDTH;
const TOP = 1 << (WIDTH - 1);
const LOW_MASK = TOP - 1;

/** @param {number} value @param {number} amount @returns {number} */
function rotateLeft(value, amount) {
  const shift = amount % WIDTH;
  const x = value & (SIZE - 1);
  return ((x << shift) | (x >>> (WIDTH - shift))) & (SIZE - 1);
}

/** @param {number} input @returns {number} */
function innerLinear(input) {
  return rotateLeft(input, WIDTH - 1);
}

/** @param {number} input @returns {number} */
function outerLinear(input) {
  return rotateLeft(input, 4);
}

/** @param {number} input @returns {number} */
function baselineLinear(input) {
  return rotateLeft(input, 3);
}

/**
 * Compatible permutation that swaps exactly the two words sharing lower
 * WIDTH-1 bits equal to trigger.
 * @param {number} trigger
 * @param {number} input
 * @returns {number}
 */
function sparseCompatiblePermutation(trigger, input) {
  const x = input & (SIZE - 1);
  return (x & LOW_MASK) === trigger ? x ^ TOP : x;
}

/** @param {number} trigger @param {number} input @returns {number} */
function sandwich(trigger, input) {
  return outerLinear(sparseCompatiblePermutation(trigger, innerLinear(input)));
}

/** @param {number} value @returns {number} */
function parity(value) {
  let x = value & (SIZE - 1);
  let bit = 0;
  while (x !== 0) {
    bit ^= x & 1;
    x >>>= 1;
  }
  return bit;
}

/** @param {number} trigger */
function verifyCompatibility(trigger) {
  for (let k = 0; k <= WIDTH; k += 1) {
    const mask = (1 << k) - 1;
    /** @type {Map<number,number>} */
    const residues = new Map();
    for (let input = 0; input < SIZE; input += 1) {
      const inputResidue = input & mask;
      const outputResidue = sparseCompatiblePermutation(trigger, input) & mask;
      const prior = residues.get(inputResidue);
      if (prior === undefined) residues.set(inputResidue, outputResidue);
      else if (prior !== outputResidue) throw new Error('compatibility failure');
    }
  }
}

function main() {
  const pairKeys = new Set();

  for (let trigger = 0; trigger < TOP; trigger += 1) {
    verifyCompatibility(trigger);
    const support = [];
    const outputs = new Set();
    for (let input = 0; input < SIZE; input += 1) {
      const output = sandwich(trigger, input);
      outputs.add(output);
      if (output !== baselineLinear(input)) support.push(input);
    }
    if (outputs.size !== SIZE) throw new Error('permutation failure');
    if (support.length !== 2 || (support[0] ^ support[1]) !== 1) {
      throw new Error('unexpected sparse support');
    }
    pairKeys.add(Math.min(...support));

    const outputMask = 1 << 3;
    for (let input = 0; input < SIZE; input += 1) {
      const scalarDifference =
        parity(outputMask & sandwich(trigger, input)) ^
        parity(outputMask & baselineLinear(input));
      if (scalarDifference !== Number(support.includes(input))) {
        throw new Error('scalar defect support mismatch');
      }
    }
  }

  if (pairKeys.size !== TOP) throw new Error('hidden pairs do not partition domain');

  const transcript = [];
  for (let pair = 0; pair < TOP - 1; pair += 1) {
    const input = pair << 1;
    transcript.push([input, baselineLinear(input)]);
  }
  const hiddenPairStart = (TOP - 1) << 1;
  const hiddenTrigger = innerLinear(hiddenPairStart) & LOW_MASK;
  for (const [input, output] of transcript) {
    if (sandwich(hiddenTrigger, input) !== output) {
      throw new Error('indistinguishability witness failed');
    }
  }

  console.log(JSON.stringify({
    width: WIDTH,
    candidateHiddenPairs: TOP,
    oracleInputsInTranscript: transcript.length,
    unqueriedPair: [hiddenPairStart, hiddenPairStart ^ 1],
    allSparseSandwichesArePermutations: true,
    allSparseSandwichesAreCompatible: true,
    everyCandidateDiffersFromBaselineOnExactly: 2,
    scalarAffineDefectSupport: 2,
    transcriptIndistinguishableFromOneUnqueriedSparseCandidate: true,
    consequence: 'exact deterministic global certification needs at least 2^(n-1) oracle input evaluations in this family'
  }, null, 2));
}

if (require.main === module) main();

module.exports = {
  baselineLinear,
  sandwich,
  sparseCompatiblePermutation,
};
