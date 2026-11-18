'use strict';

const assert = require('node:assert/strict');
const {Encoder, Tag} = require('cbor-x');

const encoder = new Encoder({
  structuredClone: true,
  useRecords: false
});

/** @typedef {{index:number,label:string,quantity:number}} Item */
/** @typedef {{category:string,records:Item[]}} Payload */

/** @param {number} count @returns {Payload} */
function payload(count) {
  return {
    category: 'cbor-x-wire-pilot',
    records: Array.from({length: count}, (_, index) => ({
      index,
      label: 'event-' + index + (index % 11 === 0 ? '終' : '') + (index % 13 === 0 ? '🧪' : ''),
      quantity: Math.imul(index + 1, 2654435761) | 0
    }))
  };
}

/** @param {unknown} value @returns {unknown} */
function jsonWire(value) {
  return JSON.parse(JSON.stringify(value));
}

/** @param {unknown} value @returns {unknown} */
function cborWire(value) {
  return encoder.decode(encoder.encode(value));
}

/**
 * @param {Payload} data
 * @param {boolean} heavy
 * @returns {number}
 */
function task(data, heavy) {
  let state = 0x13579bdf;
  for (const record of data.records) {
    state = Math.imul(state ^ record.quantity ^ record.index, 0x45d9f3b) | 0;
    state = (state + record.label.length) | 0;
  }
  if (heavy) {
    for (let round = 0; round < 25000; round++) {
      state = Math.imul((state ^ round) | 0, 0x27d4eb2d) | 0;
    }
  }
  return state | 0;
}

/** @param {number[]} values @returns {number} */
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * @param {'native'|'json'|'cbor'} variant
 * @param {Payload} data
 * @param {number} repeats
 * @param {boolean} heavy
 * @returns {{cpuMicros:number,checksum:number}}
 */
function sample(variant, data, repeats, heavy) {
  let checksum = 0;
  const started = process.cpuUsage();
  for (let i = 0; i < repeats; i++) {
    const input = variant === 'native' ? data :
      /** @type {Payload} */ (variant === 'json' ? jsonWire(data) : cborWire(data));
    checksum = (checksum + task(input, heavy)) | 0;
  }
  const elapsed = process.cpuUsage(started);
  return {cpuMicros: elapsed.user + elapsed.system, checksum};
}

/**
 * @param {number[]} native
 * @param {number[]} candidate
 * @returns {{ratioOfMedians:number,strictBreaches:number,maxPairRatio:number,pairRatios:number[]}}
 */
function paired(native, candidate) {
  const pairRatios = candidate.map((value, index) => value / native[index]);
  return {
    ratioOfMedians: median(candidate) / median(native),
    strictBreaches: pairRatios.filter(ratio => ratio > 2.5).length,
    maxPairRatio: Math.max(...pairRatios),
    pairRatios
  };
}

/**
 * @param {Payload} data
 * @param {number} repeats
 * @param {boolean} heavy
 * @returns {object}
 */
function profile(data, repeats, heavy) {
  /** @type {number[]} */
  const native = [];
  /** @type {number[]} */
  const json = [];
  /** @type {number[]} */
  const cbor = [];
  for (let warm = 0; warm < 4; warm++) {
    sample('native', data, 2, heavy);
    sample('json', data, 2, heavy);
    sample('cbor', data, 2, heavy);
  }
  const orders = [
    /** @type {const} */ (['native', 'json', 'cbor']),
    /** @type {const} */ (['cbor', 'native', 'json']),
    /** @type {const} */ (['json', 'cbor', 'native'])
  ];
  for (let trial = 0; trial < 9; trial++) {
    /** @type {Record<string, number>} */
    const checksums = {};
    for (const variant of orders[trial % orders.length]) {
      const observation = sample(variant, data, repeats, heavy);
      checksums[variant] = observation.checksum;
      (variant === 'native' ? native : variant === 'json' ? json : cbor)
        .push(observation.cpuMicros);
    }
    assert.equal(checksums.json, checksums.native);
    assert.equal(checksums.cbor, checksums.native);
  }
  return {
    nativeCpuMicros: native,
    jsonCpuMicros: json,
    cborCpuMicros: cbor,
    jsonVsNative: paired(native, json),
    cborVsNative: paired(native, cbor),
    cborVsJson: paired(json, cbor)
  };
}

/** @returns {object} */
function semanticProbe() {
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
  assert.throws(() => jsonWire(source), TypeError);
  const restored = /** @type {Record<string, any>} */ (cborWire(source));
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
  const semanticContractMet = Object.values(observations).every(Boolean);

  // CBOR tag 1000 followed by integer 1. The publisher documents unknown
  // tags as inert Tag values rather than ambient constructor lookups.
  const unknown = encoder.decode(Uint8Array.of(0xd9, 0x03, 0xe8, 0x01));
  assert.ok(unknown instanceof Tag);
  assert.equal(unknown.value, 1);
  return {
    observations,
    semanticContractMet,
    unknownTagConstructor: unknown.constructor.name,
    unknownTagValue: unknown.value
  };
}

/** @returns {object} */
function run() {
  const semantics = semanticProbe();
  const rows = [];
  for (const count of [1, 32, 256, 1024]) {
    const data = payload(count);
    const jsonBytes = Buffer.byteLength(JSON.stringify(data));
    const cborBytes = encoder.encode(data).byteLength;
    for (const heavy of [false, true]) {
      const repeats = heavy ? 32 : Math.max(200, Math.floor(200000 / count));
      rows.push({
        count,
        workload: heavy ? '25000-round-CPU-task' : 'small-state-task',
        repeats,
        jsonBytes,
        cborBytes,
        profile: profile(data, repeats, heavy)
      });
    }
  }
  return {
    node: process.version,
    platform: process.platform,
    package: 'cbor-x@1.6.9',
    options: {structuredClone: true, useRecords: false},
    semantics,
    measurementBoundary: 'in-process encode/decode plus task CPU; no HTTP, browser module load, auth, or network',
    rows
  };
}

if (require.main === module) {
  process.stdout.write('SCO_CBORX_WIRE_PILOT ' + JSON.stringify(run()) + '\n');
}

module.exports = {payload, jsonWire, cborWire, task, semanticProbe, profile, run};
