'use strict';

const assert = require('node:assert/strict');

const SOURCE_REPOSITORY = 'xqzme69/A2MBA-LLVM';
const SOURCE_COMMIT = 'f22cafe972989f868b2898ac4839df27fb74fc61';

/** @param {number} input @param {number} rotation @returns {number} */
function rotateLeft32(input, rotation) {
  return ((input << rotation) | (input >>> (32 - rotation))) | 0;
}

/** @param {number} input @param {number} rotation @returns {number} */
function rotateRight32(input, rotation) {
  return ((input >>> rotation) | (input << (32 - rotation))) | 0;
}

/**
 * Create the pinned implementation's packed rotated-add rule with all
 * compile-time constants hoisted, matching the LLVM emission model.
 *
 * @param {number} rotation
 * @returns {(left:number,right:number)=>number}
 */
function makePackedRotatedAdd32(rotation) {
  assert.ok(rotation >= 1 && rotation <= 31);
  const back = 32 - rotation;
  const mask = (2 ** rotation - 1) | 0;
  return (left, right) => {
    const sum = (left + right) | 0;
    const high = ((left >>> rotation) + (right >>> rotation)) | 0;
    const carry = high >>> back;
    const upper = high << rotation;
    const lower = (sum + carry) & mask;
    return (upper | lower) | 0;
  };
}

/**
 * External fixture expression from test/Wrapper/coordinates.c, after Int32
 * conversion.
 *
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {number} t
 * @returns {number}
 */
function nativeRegion32(x, y, z, t) {
  const left = ((((x ^ t) + y) | 0) + (z & t)) | 0;
  const right = ((x + z) | 0) | y;
  return (left ^ right) | 0;
}

/**
 * Port the pinned coordinate-region emitter for the same fixture. The first
 * leaf layer stays native, matching Region.trimLeaves(). The remaining closed
 * core stays in a rotated coordinate system until the final result.
 *
 * @param {number} rotation
 * @returns {(x:number,y:number,z:number,t:number)=>number}
 */
function makeRotatedCore32(rotation) {
  assert.ok(rotation >= 1 && rotation <= 31);
  const add = makePackedRotatedAdd32(rotation);
  return (x, y, z, t) => {
    const leafA = (x ^ t) | 0;
    const leafB = (z & t) | 0;
    const leafC = (x + z) | 0;
    const a = rotateLeft32(leafA, rotation);
    const b = rotateLeft32(leafB, rotation);
    const c = rotateLeft32(leafC, rotation);
    const rotatedY = rotateLeft32(y, rotation);
    const first = add(a, rotatedY);
    const second = add(first, b);
    const third = (c | rotatedY) | 0;
    return rotateRight32(second ^ third, rotation);
  };
}

/** @returns {{rotations:number,randomCases:number}} */
function verifyRotatedCore32() {
  let state = 0x9e3779b9 | 0;
  const perRotation = 20000;
  for (let rotation = 1; rotation <= 31; rotation++) {
    const protectedRegion = makeRotatedCore32(rotation);
    for (let index = 0; index < perRotation; index++) {
      state = (Math.imul(state, 1103515245) + 12345) | 0;
      const x = state;
      const y = (state ^ 0xa5a5a5a5) | 0;
      const z = Math.imul(state, 3);
      const t = state >>> 7;
      assert.equal(protectedRegion(x, y, z, t), nativeRegion32(x, y, z, t));
    }
  }
  return {rotations: 31, randomCases: 31 * perRotation};
}

/**
 * @param {(x:number,y:number,z:number,t:number)=>number} fn
 * @param {number} count
 * @returns {number}
 */
function run(fn, count) {
  let state = 0x12345678 | 0;
  let sum = 0;
  for (let index = 0; index < count; index++) {
    state = (Math.imul(state, 1664525) + 1013904223) | 0;
    sum = (sum + fn(state, index | 0, (state ^ index) | 0, Math.imul(state, 0x45d9f3b))) | 0;
  }
  return sum;
}

/**
 * @param {(x:number,y:number,z:number,t:number)=>number} fn
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
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * @param {number} rotation
 * @param {number} count
 * @param {number} trials
 * @returns {Record<string, unknown>}
 */
function profileRotation(rotation, count, trials) {
  const candidate = makeRotatedCore32(rotation);
  for (let warmup = 0; warmup < 4; warmup++) {
    run(nativeRegion32, 200000);
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
      nativeSample = cpuMicrosPerCall(nativeRegion32, count);
      protectedSample = cpuMicrosPerCall(candidate, count);
    } else {
      protectedSample = cpuMicrosPerCall(candidate, count);
      nativeSample = cpuMicrosPerCall(nativeRegion32, count);
    }
    native.push(nativeSample);
    protectedSamples.push(protectedSample);
    ratios.push(protectedSample / nativeSample);
  }
  return {
    rotation,
    ratioOfMedians: median(protectedSamples) / median(native),
    strictBreaches: ratios.filter(ratio => ratio > 2.5).length,
    maxPairRatio: Math.max(...ratios),
    pairRatios: ratios,
    nativeSamplesMicrosPerCall: native,
    protectedSamplesMicrosPerCall: protectedSamples
  };
}

/** @returns {{count:number,trials:number,records:Array<Record<string,unknown>>}} */
function profileRuntime() {
  const count = 25000000;
  const trials = 7;
  const rotations = [1, 2, 3, 4, 5, 8, 11, 16, 23, 31];
  return {count, trials, records: rotations.map(rotation => profileRotation(rotation, count, trials))};
}

function main() {
  console.log(JSON.stringify({
    node: process.version,
    platform: process.platform,
    sourceRepository: SOURCE_REPOSITORY,
    sourceCommit: SOURCE_COMMIT,
    verification: verifyRotatedCore32(),
    runtime: profileRuntime()
  }, null, 2));
}

if (require.main === module) main();

module.exports = {
  SOURCE_COMMIT,
  SOURCE_REPOSITORY,
  rotateLeft32,
  rotateRight32,
  makePackedRotatedAdd32,
  nativeRegion32,
  makeRotatedCore32,
  verifyRotatedCore32,
  profileRuntime
};
