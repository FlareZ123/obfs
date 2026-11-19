'use strict';

const WIDTH = 8;
const SIZE = 1 << WIDTH;
const TOP = 1 << (WIDTH - 1);
const LOW_MASK = TOP - 1;
const INPUT_PAIR_DIRECTION = 1;

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

/** @param {number} output @returns {number} */
function inverseBaseline(output) {
  return rotateLeft(output, WIDTH - 3);
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

/**
 * Under known A and u, one target check separates the two points in its pair.
 * @param {number} trigger
 * @param {number} target
 * @returns {number}
 */
function invertWithKnownBaselineAndDirection(trigger, target) {
  const candidate = inverseBaseline(target);
  return sandwich(trigger, candidate) === target
    ? candidate
    : candidate ^ INPUT_PAIR_DIRECTION;
}

/**
 * Count nonzero second-derivative samples for a two-point scalar defect h.
 * @param {number[]} support
 * @returns {number}
 */
function countScalarDefectSamples(support) {
  const exceptional = new Set(support);
  let count = 0;
  for (let point = 0; point < SIZE; point += 1) {
    for (let direction = 0; direction < SIZE; direction += 1) {
      const defect =
        Number(exceptional.has(point)) ^
        Number(exceptional.has(point ^ direction)) ^
        Number(exceptional.has(0)) ^
        Number(exceptional.has(direction));
      count += defect;
    }
  }
  return count;
}

function main() {
  const pairKeys = new Set();
  let genericSupport = null;
  let targetInversions = 0;

  for (let trigger = 0; trigger < TOP; trigger += 1) {
    verifyCompatibility(trigger);
    const support = [];
    const outputs = new Set();
    for (let input = 0; input < SIZE; input += 1) {
      const output = sandwich(trigger, input);
      outputs.add(output);
      if (output !== baselineLinear(input)) support.push(input);

      const recovered = invertWithKnownBaselineAndDirection(trigger, output);
      if (recovered !== input) throw new Error('known-baseline target inversion failure');
      targetInversions += 1;
    }
    if (outputs.size !== SIZE) throw new Error('permutation failure');
    if (support.length !== 2 || (support[0] ^ support[1]) !== INPUT_PAIR_DIRECTION) {
      throw new Error('unexpected sparse support');
    }
    pairKeys.add(Math.min(...support));
    if (genericSupport === null && !support.includes(0)) genericSupport = support;

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
  if (genericSupport === null) throw new Error('missing generic support');

  const scalarDefectSamples = countScalarDefectSamples(genericSupport);
  const expectedDefectSamples = 6 * SIZE - 24;
  if (scalarDefectSamples !== expectedDefectSamples) {
    throw new Error(`second-derivative count ${scalarDefectSamples}`);
  }

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
    unqueriedPair: [hiddenPairStart, hiddenPairStart ^ INPUT_PAIR_DIRECTION],
    allSparseSandwichesArePermutations: true,
    allSparseSandwichesAreCompatible: true,
    everyCandidateDiffersFromBaselineOnExactly: 2,
    scalarAffineDefectSupport: 2,
    scalarSecondDerivativeNonzeroSamples: scalarDefectSamples,
    scalarSecondDerivativeTotalSamples: SIZE * SIZE,
    scalarSecondDerivativeExactFormula: '(6*2^n-24)/2^(2n) when 0 is outside the two-point support',
    knownBaselineAndDirectionTargetInversions: targetInversions,
    maxAdditionalQueriesWithKnownBaselineAndDirection: 1,
    transcriptIndistinguishableFromOneUnqueriedSparseCandidate: true,
    consequence: 'global exact certification is exponentially harder than target inversion for this sparse family under the same side information',
  }, null, 2));
}

if (require.main === module) main();

module.exports = {
  baselineLinear,
  sandwich,
  sparseCompatiblePermutation,
};
