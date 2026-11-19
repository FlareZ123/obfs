'use strict';

const assert = require('node:assert/strict');

const SOURCE_REPOSITORY = 'xqzme69/A2MBA-LLVM';
const SOURCE_COMMIT = 'f22cafe972989f868b2898ac4839df27fb74fc61';

/**
 * Port of the six Context Trap reconstruction forms from the pinned A2MBA-LLVM
 * implementation into ECMAScript Int32 operations.
 *
 * @param {number} input
 * @param {number} shift
 * @param {number} selectedBits
 * @param {number} variant
 * @returns {number}
 */
function contextTrap32(input, shift, selectedBits, variant) {
  input |= 0;
  const lowDomain = (1 << shift) - 1;
  assert.ok(shift >= 1 && shift <= 8);
  assert.ok(selectedBits >= 1 && selectedBits <= lowDomain);

  const low = input & selectedBits;
  const high = input & ~selectedBits;
  const safeMask = 0x7fffffff >>> shift;
  const fillBit = 1 << (31 - shift);
  const poisonBit = 1 << (32 - shift);
  const projectionMask = selectedBits | poisonBit;

  const trapInput = input & safeMask;
  const trapShifted = trapInput << shift;
  const trapRestored = trapShifted >> shift;
  const trapProjection = trapRestored & projectionMask;

  const triggerInput = input | fillBit;
  const triggerShifted = triggerInput << shift;
  const triggerRestored = triggerShifted >> shift;
  const triggerProjection = triggerRestored & projectionMask;
  const triggerLow = triggerProjection ^ poisonBit;

  let protectedLow;
  switch (variant) {
    case 0:
      protectedLow = ((triggerLow + trapProjection) - low) | 0;
      return (high | protectedLow) | 0;
    case 1:
      protectedLow = ((triggerLow - trapProjection) + low) | 0;
      return (high ^ protectedLow) | 0;
    case 2:
      protectedLow = (triggerLow ^ trapProjection ^ low) | 0;
      return (high + protectedLow) | 0;
    case 3:
      protectedLow = (triggerLow | trapProjection) | 0;
      return (high ^ protectedLow) | 0;
    case 4: {
      const cancel = trapProjection ^ low;
      protectedLow = (triggerLow + cancel) | 0;
      return (high | protectedLow) | 0;
    }
    case 5: {
      const delta = (triggerLow - low) | 0;
      protectedLow = (trapProjection + delta) | 0;
      return (high + protectedLow) | 0;
    }
    default:
      throw new RangeError('invalid Context Trap variant');
  }
}

/** @param {number} key @returns {number} */
function oddInverse32(key) {
  key |= 0;
  assert.equal(key & 1, 1);
  let inverse = key;
  for (let bits = 1; bits < 32; bits *= 2) {
    inverse = Math.imul(inverse, 2 - Math.imul(key, inverse));
  }
  return inverse | 0;
}

/**
 * A lower-bound cost screen for the independent implementation's nonlinear
 * envelope. It uses one documented XorAdd factor construction and the standard
 * Newton inverse circuit.
 *
 * @param {number} input
 * @param {number} leftContext
 * @param {number} rightContext
 * @returns {number}
 */
function nonlinearEnvelope32(input, leftContext, rightContext) {
  const firstSalt = 0x7f4a7c15 | 0;
  const secondSalt = 0xd192ed03 | 0;
  const saltedLeft = (leftContext ^ firstSalt) | 0;
  const firstFactor = (saltedLeft + rightContext) | 0;
  const saltedRight = (rightContext + secondSalt) | 0;
  const secondFactor = (saltedRight ^ leftContext) | 0;
  const product = Math.imul(firstFactor, secondFactor);
  const doubled = (product + product) | 0;
  const key = (doubled | 1) | 0;
  const inverse = oddInverse32(key);
  return Math.imul(Math.imul(input, key), inverse) | 0;
}

/** @param {number} input @returns {number} */
function contextPlusEnvelope32(input) {
  const trapped = contextTrap32(input, 5, 0x15, 0);
  return nonlinearEnvelope32(trapped, input, trapped ^ 0x40000000);
}

/** @returns {{parameterCases:number,randomCases:number}} */
function verifyContextTrap32() {
  const edges = [0, 1, -1, 0x7fffffff, -0x80000000, 0x55555555, 0xaaaaaaaa | 0];
  let parameterCases = 0;
  for (let shift = 1; shift <= 8; shift++) {
    const maxMask = (1 << shift) - 1;
    for (let selectedBits = 1; selectedBits <= maxMask; selectedBits++) {
      for (let variant = 0; variant < 6; variant++) {
        parameterCases++;
        for (const value of edges) {
          assert.equal(contextTrap32(value, shift, selectedBits, variant), value | 0);
        }
      }
    }
  }

  let state = 0x12345678 | 0;
  const randomCases = 200000;
  for (let index = 0; index < randomCases; index++) {
    state = (Math.imul(state, 1664525) + 1013904223) | 0;
    const shift = (index & 7) + 1;
    const selectedBits = ((state >>> 24) & ((1 << shift) - 1)) || 1;
    const variant = index % 6;
    assert.equal(contextTrap32(state, shift, selectedBits, variant), state);
    assert.equal(contextPlusEnvelope32(state), state);
  }
  return {parameterCases, randomCases};
}

/** @param {number} x @param {number} y @returns {number} */
function nativeKernel(x, y) {
  return (Math.imul(x ^ y, 0x45d9f3b) + 0x27d4eb2d) | 0;
}

/** @param {number} variant @returns {(x:number,y:number)=>number} */
function makeContextKernel(variant) {
  return (x, y) => contextTrap32(nativeKernel(x, y), 5, 0x15, variant);
}

/** @param {number} x @param {number} y @returns {number} */
function envelopeKernel(x, y) {
  return contextPlusEnvelope32(nativeKernel(x, y));
}

/**
 * @param {(x:number,y:number)=>number} fn
 * @param {number} count
 * @returns {number}
 */
function run(fn, count) {
  let state = 0x12345678 | 0;
  let sum = 0;
  for (let index = 0; index < count; index++) {
    state = (Math.imul(state, 1664525) + 1013904223) | 0;
    sum = (sum + fn(state, index | 0)) | 0;
  }
  return sum;
}

/**
 * @param {(x:number,y:number)=>number} fn
 * @param {number} count
 * @returns {number}
 */
function cpuMicrosPerCall(fn, count) {
  const start = process.cpuUsage();
  const result = run(fn, count);
  const elapsed = process.cpuUsage(start);
  if (result === 0x13572468) console.log('unreachable', result);
  return (elapsed.user + elapsed.system) / count;
}

/** @param {number[]} values @returns {number} */
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * @param {string} name
 * @param {(x:number,y:number)=>number} candidate
 * @param {number} count
 * @param {number} trials
 * @returns {Record<string, unknown>}
 */
function profileCandidate(name, candidate, count, trials) {
  for (let warmup = 0; warmup < 4; warmup++) {
    run(nativeKernel, 200000);
    run(candidate, 200000);
  }
  /** @type {number[]} */
  const native = [];
  /** @type {number[]} */
  const protectedSamples = [];
  /** @type {number[]} */
  const ratios = [];
  for (let trial = 0; trial < trials; trial++) {
    let nativeSample;
    let protectedSample;
    if ((trial & 1) === 0) {
      nativeSample = cpuMicrosPerCall(nativeKernel, count);
      protectedSample = cpuMicrosPerCall(candidate, count);
    } else {
      protectedSample = cpuMicrosPerCall(candidate, count);
      nativeSample = cpuMicrosPerCall(nativeKernel, count);
    }
    native.push(nativeSample);
    protectedSamples.push(protectedSample);
    ratios.push(protectedSample / nativeSample);
  }
  return {
    name,
    ratioOfMedians: median(protectedSamples) / median(native),
    strictBreaches: ratios.filter(ratio => ratio > 2.5).length,
    maxPairRatio: Math.max(...ratios),
    pairRatios: ratios,
    nativeMedianMicrosPerCall: median(native),
    candidateMedianMicrosPerCall: median(protectedSamples)
  };
}

/** @returns {{count:number,trials:number,records:Array<Record<string,unknown>>}} */
function profileRuntime() {
  const count = 10000000;
  const trials = 7;
  /** @type {Array<Record<string,unknown>>} */
  const records = [];
  for (let variant = 0; variant < 6; variant++) {
    records.push(profileCandidate(`context-v${variant}`, makeContextKernel(variant), count, trials));
  }
  records.push(profileCandidate('context+newton-envelope', envelopeKernel, count, trials));
  return {count, trials, records};
}

function main() {
  console.log(JSON.stringify({
    node: process.version,
    platform: process.platform,
    sourceRepository: SOURCE_REPOSITORY,
    sourceCommit: SOURCE_COMMIT,
    verification: verifyContextTrap32(),
    runtime: profileRuntime()
  }, null, 2));
}

if (require.main === module) main();

module.exports = {
  SOURCE_COMMIT,
  SOURCE_REPOSITORY,
  contextTrap32,
  oddInverse32,
  nonlinearEnvelope32,
  contextPlusEnvelope32,
  verifyContextTrap32,
  profileRuntime
};
