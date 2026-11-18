'use strict';

const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {
  u32,
  forwardChain32,
  inverseChain32
} = require('./mba-author-int32-component-inverse');

const ATTACKER_COMMIT = '502d8cf096d360664e19159faa154d23f7d10d8f';
const SEED = 'heldout-after-502d8cf:2026-11-18:agent5:mba-author-int32:v1';

class HashStream {
  /** @param {string} seed */
  constructor(seed) {
    this.seed = seed;
    this.counter = 0;
  }

  /** @returns {number} */
  word() {
    return createHash('sha256')
      .update(this.seed)
      .update(':')
      .update(String(this.counter++))
      .digest()
      .readUInt32LE(0);
  }

  /** @param {number} minimum @param {number} maximum @returns {number} */
  integer(minimum, maximum) {
    return minimum + (this.word() % (maximum - minimum + 1));
  }
}

/** @param {HashStream} stream @param {number} count @returns {number[]} */
function shifts(stream, count) {
  return Array.from({length: count}, () => stream.integer(1, 31));
}

/** @param {HashStream} stream @param {number} degree @returns {number[]} */
function validCoefficients(stream, degree) {
  const coefficients = Array.from({length: degree + 1}, () => stream.word());
  coefficients[1] = u32(coefficients[1] | 1);
  let evenParity = 0;
  for (let index = 2; index <= degree; index += 2) {
    evenParity ^= coefficients[index] & 1;
  }
  if (evenParity !== 0) coefficients[2] = u32(coefficients[2] ^ 1);
  if (degree >= 3) {
    let oddParity = 0;
    for (let index = 3; index <= degree; index += 2) {
      oddParity ^= coefficients[index] & 1;
    }
    if (oddParity !== 0) coefficients[3] = u32(coefficients[3] ^ 1);
  }
  return coefficients;
}

/**
 * @param {HashStream} stream
 * @returns {{coefficients:number[],xorShifts:number[],cyclicShifts:number[]}}
 */
function randomRound(stream) {
  const degree = stream.integer(1, 3);
  const cyclicCount = stream.integer(0, 1) === 0 ? 3 : 5;
  return {
    coefficients: validCoefficients(stream, degree),
    xorShifts: shifts(stream, stream.integer(1, 2)),
    cyclicShifts: shifts(stream, cyclicCount)
  };
}

/** @returns {{cases:number,exactRecoveries:number,records:Array<Record<string,unknown>>}} */
function runHeldoutRecovery() {
  const stream = new HashStream(SEED);
  const depthChoices = [1, 2, 4, 8, 16, 32];
  /** @type {Array<Record<string,unknown>>} */
  const records = [];
  for (let index = 0; index < 32; index++) {
    const round = randomRound(stream);
    const depth = depthChoices[stream.integer(0, depthChoices.length - 1)];
    const secret = stream.word();
    const rounds = Array.from({length: depth}, () => round);
    const target = forwardChain32(secret, rounds);
    const start = process.hrtime.bigint();
    const recovered = inverseChain32(target, rounds);
    const inverseMicros = Number(process.hrtime.bigint() - start) / 1000;
    assert.equal(recovered, secret);
    records.push({
      index,
      degree: round.coefficients.length - 1,
      xorTerms: round.xorShifts.length + 1,
      cyclicTerms: round.cyclicShifts.length,
      depth,
      target,
      exact: true,
      inverseMicros
    });
  }
  return {cases: records.length, exactRecoveries: records.length, records};
}

/** @param {number} input @param {number} rounds @returns {number} */
function optimizedTransform32(input, rounds) {
  let x = input >>> 0;
  for (let round = 0; round < rounds; round++) {
    x = (0x91e10da5 ^ Math.imul(0x6d2b79f5, x)) >>> 0;
    x = (x ^ (x >>> 7) ^ (x >>> 19)) >>> 0;
    x = (
      ((x << 3) | (x >>> 29)) ^
      ((x << 11) | (x >>> 21)) ^
      ((x << 23) | (x >>> 9))
    ) >>> 0;
  }
  return x;
}

/** @param {number} code @returns {boolean} */
function nativePredicate(code) {
  return code === 47;
}

/** @param {number} rounds @returns {(code:number)=>boolean} */
function protectedPredicate(rounds) {
  const target = optimizedTransform32(47, rounds);
  return code => optimizedTransform32(code, rounds) === target;
}

/** @param {(code:number)=>boolean} predicate @param {number} count @returns {number} */
function work(predicate, count) {
  let hits = 0;
  for (let index = 0; index < count; index++) {
    const code = (Math.imul(index, 1103515245) + 12345) >>> 25;
    if (predicate(code)) hits++;
  }
  return hits;
}

/**
 * @param {(code:number)=>boolean} predicate
 * @param {number} count
 * @returns {number}
 */
function cpuMicrosPerCall(predicate, count) {
  const start = process.cpuUsage();
  const hits = work(predicate, count);
  const elapsed = process.cpuUsage(start);
  assert.ok(hits > 0);
  return (elapsed.user + elapsed.system) / count;
}

/** @param {number[]} values @returns {number} */
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** @returns {{trials:number,cases:Array<Record<string,unknown>>}} */
function profileRuntime() {
  const trials = 9;
  const nativeCount = 100000000;
  /** @type {Array<Record<string,unknown>>} */
  const cases = [];
  for (const rounds of [1, 2, 4, 8, 16, 32, 48]) {
    const protectedCount = rounds <= 2 ? 20000000 :
      rounds <= 8 ? 10000000 : rounds <= 16 ? 5000000 : 2000000;
    const candidate = protectedPredicate(rounds);
    for (let code = 0; code < 128; code++) {
      assert.equal(candidate(code), nativePredicate(code));
    }
    for (let warmup = 0; warmup < 4; warmup++) {
      work(nativePredicate, 500000);
      work(candidate, 100000);
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
        nativeSample = cpuMicrosPerCall(nativePredicate, nativeCount);
        protectedSample = cpuMicrosPerCall(candidate, protectedCount);
      } else {
        protectedSample = cpuMicrosPerCall(candidate, protectedCount);
        nativeSample = cpuMicrosPerCall(nativePredicate, nativeCount);
      }
      native.push(nativeSample);
      protectedSamples.push(protectedSample);
      ratios.push(protectedSample / nativeSample);
    }
    cases.push({
      rounds,
      nativeMedianMicrosPerCall: median(native),
      protectedMedianMicrosPerCall: median(protectedSamples),
      ratioOfMedians: median(protectedSamples) / median(native),
      strictBreaches: ratios.filter(ratio => ratio > 2.5).length,
      maxPairRatio: Math.max(...ratios),
      pairRatios: ratios,
      nativeSamplesMicrosPerCall: native,
      protectedSamplesMicrosPerCall: protectedSamples
    });
  }
  return {trials, cases};
}

function main() {
  console.log(JSON.stringify({
    node: process.version,
    platform: process.platform,
    attackerCommit: ATTACKER_COMMIT,
    seed: SEED,
    heldout: runHeldoutRecovery(),
    runtime: profileRuntime()
  }, null, 2));
}

if (require.main === module) main();

module.exports = {runHeldoutRecovery, optimizedTransform32, profileRuntime};
