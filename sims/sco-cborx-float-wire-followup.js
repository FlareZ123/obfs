'use strict';

const assert = require('node:assert/strict');
const {Encoder, Tag} = require('cbor-x');
const {payload, jsonWire, task} = require('./sco-cborx-wire-pilot');

const defaultEncoder = new Encoder({
  structuredClone: true,
  useRecords: false
});
const floatEncoder = new Encoder({
  structuredClone: true,
  useRecords: false,
  alwaysUseFloat: true
});

/** @param {Encoder} encoder @param {unknown} value @returns {unknown} */
function cborWire(encoder, value) {
  return encoder.decode(encoder.encode(value));
}

/**
 * @param {Encoder} encoder
 * @returns {{observations:Record<string,boolean>,semanticContractMet:boolean,
 *   unknownTagConstructor:string,unknownTagValue:unknown}}
 */
function semanticProbe(encoder) {
  const shared = {marker: 'shared'};
  /** @type {Record<string, unknown>} */
  const source = {
    left: shared,
    right: shared,
    missing: undefined,
    nan: NaN,
    negativeZero: -0,
    bigint: 12345678901234567890n,
    date: new Date('2026-11-18T00:00:00.000Z'),
    regexp: /obfs/gi,
    set: new Set([1, 2, 3]),
    map: new Map([['x', 7]])
  };
  source.self = source;
  const restored = /** @type {Record<string, any>} */ (cborWire(encoder, source));
  const observations = {
    cycle: restored.self === restored,
    sharedReference: restored.left === restored.right,
    ownUndefined: Object.hasOwn(restored, 'missing') && restored.missing === undefined,
    nan: Number.isNaN(restored.nan),
    negativeZero: Object.is(restored.negativeZero, -0),
    bigint: restored.bigint === 12345678901234567890n,
    date: restored.date instanceof Date &&
      restored.date.toISOString() === '2026-11-18T00:00:00.000Z',
    regexp: restored.regexp instanceof RegExp &&
      restored.regexp.source === 'obfs' && restored.regexp.flags === 'gi',
    set: restored.set instanceof Set && [...restored.set].join(',') === '1,2,3',
    map: restored.map instanceof Map && restored.map.get('x') === 7,
    detachedFromOriginal: restored !== source && restored.left !== shared
  };
  const unknown = encoder.decode(Uint8Array.of(0xd9, 0x03, 0xe8, 0x01));
  assert.ok(unknown instanceof Tag);
  assert.equal(unknown.value, 1);
  return {
    observations,
    semanticContractMet: Object.values(observations).every(Boolean),
    unknownTagConstructor: unknown.constructor.name,
    unknownTagValue: unknown.value
  };
}

/** @param {number[]} values @returns {number|null} */
function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * @param {number[]} baseline
 * @param {number[]} candidate
 * @returns {{ratioOfMedians:number|null,evaluablePairs:number,unresolvedPairs:number,
 *   strictBreaches:number,maxPairRatio:number|null,pairRatios:Array<number|null>}}
 */
function paired(baseline, candidate) {
  const pairRatios = candidate.map((value, index) =>
    baseline[index] > 0 ? value / baseline[index] : null);
  const evaluable = pairRatios.filter(
    /** @returns {value is number} */ value => value !== null && Number.isFinite(value));
  const baseMedian = median(baseline);
  const candidateMedian = median(candidate);
  return {
    ratioOfMedians: baseMedian !== null && baseMedian > 0 && candidateMedian !== null ?
      candidateMedian / baseMedian : null,
    evaluablePairs: evaluable.length,
    unresolvedPairs: pairRatios.length - evaluable.length,
    strictBreaches: evaluable.filter(value => value > 2.5).length,
    maxPairRatio: evaluable.length > 0 ? Math.max(...evaluable) : null,
    pairRatios
  };
}

/**
 * @param {'native'|'json'|'cborDefault'|'cborFloat'} variant
 * @param {ReturnType<payload>} data
 * @param {number} repeats
 * @returns {{cpuMicros:number,checksum:number}}
 */
function sample(variant, data, repeats) {
  let checksum = 0;
  const started = process.cpuUsage();
  for (let i = 0; i < repeats; i++) {
    const input = variant === 'native' ? data :
      /** @type {ReturnType<payload>} */ (
        variant === 'json' ? jsonWire(data) :
        cborWire(variant === 'cborDefault' ? defaultEncoder : floatEncoder, data)
      );
    checksum = (checksum + task(input, true)) | 0;
  }
  const elapsed = process.cpuUsage(started);
  return {cpuMicros: elapsed.user + elapsed.system, checksum};
}

/** @param {ReturnType<payload>} data @returns {object} */
function profile(data) {
  const repeats = 4096;
  const variants = /** @type {const} */ (['native', 'json', 'cborDefault', 'cborFloat']);
  /** @type {Record<typeof variants[number],number[]>} */
  const samples = {native: [], json: [], cborDefault: [], cborFloat: []};
  for (const variant of variants) sample(variant, data, 32);

  const orders = [
    /** @type {const} */ (['native', 'json', 'cborDefault', 'cborFloat']),
    /** @type {const} */ (['cborFloat', 'native', 'json', 'cborDefault']),
    /** @type {const} */ (['cborDefault', 'cborFloat', 'native', 'json']),
    /** @type {const} */ (['json', 'cborDefault', 'cborFloat', 'native'])
  ];
  for (let trial = 0; trial < 12; trial++) {
    /** @type {Record<string,number>} */
    const checksums = {};
    for (const variant of orders[trial % orders.length]) {
      const observation = sample(variant, data, repeats);
      checksums[variant] = observation.checksum;
      samples[variant].push(observation.cpuMicros);
    }
    assert.equal(checksums.json, checksums.native);
    assert.equal(checksums.cborDefault, checksums.native);
    assert.equal(checksums.cborFloat, checksums.native);
  }
  return {
    repeats,
    rawCpuMicros: samples,
    jsonVsNative: paired(samples.native, samples.json),
    defaultVsNative: paired(samples.native, samples.cborDefault),
    floatVsNative: paired(samples.native, samples.cborFloat),
    floatVsDefault: paired(samples.cborDefault, samples.cborFloat),
    floatVsJson: paired(samples.json, samples.cborFloat)
  };
}

/** @returns {object} */
function run() {
  const semantics = {
    cborDefault: semanticProbe(defaultEncoder),
    cborFloat: semanticProbe(floatEncoder)
  };
  const rows = [1, 32].map(count => {
    const data = payload(count);
    return {
      count,
      jsonBytes: Buffer.byteLength(JSON.stringify(data)),
      defaultBytes: defaultEncoder.encode(data).byteLength,
      floatBytes: floatEncoder.encode(data).byteLength,
      profile: profile(data)
    };
  });
  return {
    node: process.version,
    platform: process.platform,
    package: 'cbor-x@1.6.9',
    semantics,
    rows,
    measurementBoundary: 'in-process encode/decode plus 25k-round task CPU; 4096 calls/sample; no HTTP/browser/auth/network'
  };
}

if (require.main === module) {
  process.stdout.write('SCO_CBORX_FLOAT_FOLLOWUP ' + JSON.stringify(run()) + '\n');
}

module.exports = {semanticProbe, paired, profile, run};
