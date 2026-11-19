'use strict';

const assert = require('node:assert/strict');
const {Encoder} = require('cbor-x');
const {pairedBudgetBound} = require('./paired-budget-bound');

const encoder = new Encoder({
  structuredClone: true,
  useRecords: false,
  alwaysUseFloat: true
});

/** @template T @param {T} value @returns {T} */
function cborWire(value) {
  return /** @type {T} */ (encoder.decode(encoder.encode(value)));
}

/** @template T @param {T} value @returns {T} */
function jsonWire(value) {
  return /** @type {T} */ (JSON.parse(JSON.stringify(value)));
}

/**
 * @param {(...args:any[])=>unknown} task
 * @param {unknown[]} args
 * @returns {unknown}
 */
function invokeCborValue(task, args) {
  const serverArgs = /** @type {unknown[]} */ (cborWire(args));
  const result = task(...serverArgs);
  return cborWire(result);
}

/**
 * @param {(...args:any[])=>unknown} task
 * @param {unknown[]} args
 * @returns {unknown}
 */
function invokeRootIdentity(task, args) {
  const serverArgs = /** @type {unknown[]} */ (cborWire(args));
  const result = task(...serverArgs);
  let index = -1;
  if (typeof result === 'object' && result !== null) {
    index = serverArgs.findIndex(arg => arg === result);
  }
  const response = index >= 0 ? {kind: 'arg', index} : {kind: 'value', value: result};
  const decoded = /** @type {{kind:'arg',index:number}|{kind:'value',value:unknown}} */ (cborWire(response));
  if (decoded.kind === 'arg') {
    const original = args[decoded.index];
    if (original === undefined) throw new TypeError('Invalid root-identity argument index');
    return original;
  }
  return decoded.value;
}

/**
 * @param {(...args:any[])=>unknown} task
 * @param {unknown[]} args
 * @returns {unknown}
 */
function invokeJsonValue(task, args) {
  const serverArgs = /** @type {unknown[]} */ (jsonWire(args));
  const result = task(...serverArgs);
  return jsonWire(result);
}

/** @returns {object} */
function semanticProbe() {
  const shared = {marker: 'shared'};
  /** @type {any} */
  const root = {
    left: shared,
    right: shared,
    missing: undefined,
    nan: NaN,
    negativeZero: -0,
    bigint: 12345678901234567890n,
    date: new Date('2026-11-19T00:00:00.000Z'),
    regexp: /obfs/gi,
    set: new Set([1, 2, 3]),
    map: new Map([['x', 7]])
  };
  root.self = root;

  const echo = invokeRootIdentity(value => value, [root]);
  assert.strictEqual(echo, root);

  const alias = {count: 1};
  const duplicateAlias = invokeRootIdentity((a, b) => a === b, [alias, alias]);
  assert.equal(duplicateAlias, true);

  const observed = /** @type {any} */ (invokeRootIdentity(value => ({
    cycle: value.self === value,
    sharedReference: value.left === value.right,
    ownUndefined: Object.hasOwn(value, 'missing') && value.missing === undefined,
    nan: Number.isNaN(value.nan),
    negativeZero: Object.is(value.negativeZero, -0),
    bigint: value.bigint === 12345678901234567890n,
    date: value.date instanceof Date && value.date.toISOString() === '2026-11-19T00:00:00.000Z',
    regexp: value.regexp instanceof RegExp && value.regexp.source === 'obfs' && value.regexp.flags === 'gi',
    set: value.set instanceof Set && [...value.set].join(',') === '1,2,3',
    map: value.map instanceof Map && value.map.get('x') === 7
  }), [root]));
  assert.equal(Object.values(observed).every(Boolean), true);

  const created = /** @type {any} */ (invokeRootIdentity(() => {
    /** @type {any} */
    const value = {
      missing: undefined,
      nan: NaN,
      negativeZero: -0,
      bigint: 12345678901234567890n,
      date: new Date('2026-11-19T00:00:00.000Z'),
      regexp: /obfs/gi,
      set: new Set([1, 2, 3]),
      map: new Map([['x', 7]])
    };
    value.self = value;
    value.left = {v: 1};
    value.right = value.left;
    return value;
  }, [root]));
  assert.strictEqual(created.self, created);
  assert.strictEqual(created.left, created.right);
  assert.equal(Object.hasOwn(created, 'missing') && created.missing === undefined, true);
  assert.equal(Number.isNaN(created.nan), true);
  assert.equal(Object.is(created.negativeZero, -0), true);
  assert.equal(created.bigint, 12345678901234567890n);
  assert.equal(created.date instanceof Date && created.date.toISOString() === '2026-11-19T00:00:00.000Z', true);
  assert.equal(created.regexp instanceof RegExp && created.regexp.source === 'obfs' && created.regexp.flags === 'gi', true);
  assert.equal(created.set instanceof Set && [...created.set].join(',') === '1,2,3', true);
  assert.equal(created.map instanceof Map && created.map.get('x') === 7, true);

  const nested = {value: 9};
  const source = {nested};
  const nestedResult = /** @type {{value:number}} */ (invokeRootIdentity(value => value.nested, [source]));
  assert.deepEqual(nestedResult, nested);
  assert.notStrictEqual(nestedResult, nested);

  return {
    echoIdentity: echo === root,
    duplicateAliasServerSide: duplicateAlias === true,
    inputObservations: observed,
    newValue: {
      cycle: created.self === created,
      sharedReference: created.left === created.right,
      ownUndefined: Object.hasOwn(created, 'missing') && created.missing === undefined,
      nan: Number.isNaN(created.nan),
      negativeZero: Object.is(created.negativeZero, -0),
      bigint: created.bigint === 12345678901234567890n,
      date: created.date instanceof Date,
      regexp: created.regexp instanceof RegExp,
      set: created.set instanceof Set,
      map: created.map instanceof Map
    },
    nestedIdentityBoundary: {
      equalValue: nestedResult.value === nested.value,
      sameIdentity: nestedResult === nested
    }
  };
}

/** @param {number} count @returns {{category:string,records:Array<{index:number,label:string,quantity:number}>}} */
function payload(count) {
  return {
    category: 'cbor-root-identity',
    records: Array.from({length: count}, (_, index) => ({
      index,
      label: 'event-' + index,
      quantity: Math.imul(index + 1, 2654435761) | 0
    }))
  };
}

/** @param {ReturnType<typeof payload>} data @returns {ReturnType<typeof payload>} */
function task(data) {
  let state = 0x13579bdf;
  for (const record of data.records) {
    state = Math.imul((state ^ record.quantity ^ record.index) | 0, 0x45d9f3b) | 0;
    state = (state + record.label.length) | 0;
  }
  for (let round = 0; round < 25000; round++) state = Math.imul((state ^ round) | 0, 0x27d4eb2d) | 0;
  if (state === 0x7fffffff) throw new Error('Unreachable state guard');
  return data;
}

/**
 * @param {'native'|'jsonValue'|'cborValue'|'rootIdentity'} variant
 * @param {ReturnType<typeof payload>} data
 * @param {number} repeats
 * @returns {{cpuMicros:number,checksum:number,identityPreserved:boolean|null}}
 */
function sample(variant, data, repeats) {
  let checksum = 0;
  let identityPreserved = null;
  const started = process.cpuUsage();
  for (let index = 0; index < repeats; index++) {
    let result;
    if (variant === 'native') result = task(data);
    else if (variant === 'jsonValue') result = /** @type {ReturnType<typeof payload>} */ (invokeJsonValue(task, [data]));
    else if (variant === 'cborValue') result = /** @type {ReturnType<typeof payload>} */ (invokeCborValue(task, [data]));
    else result = /** @type {ReturnType<typeof payload>} */ (invokeRootIdentity(task, [data]));
    const first = result.records[0];
    if (!first) throw new RangeError('Payload must contain at least one record');
    checksum = (checksum + first.quantity + first.label.length) | 0;
    if (variant === 'rootIdentity') {
      const same = result === data;
      identityPreserved = identityPreserved === null ? same : identityPreserved && same;
    }
  }
  const elapsed = process.cpuUsage(started);
  return {cpuMicros: elapsed.user + elapsed.system, checksum, identityPreserved};
}

/** @param {number[]} native @param {number[]} candidate @returns {number} */
function strictBreaches(native, candidate) {
  return candidate.filter((value, index) => value / native[index] > 2.5).length;
}

/** @param {ReturnType<typeof payload>} data @returns {object} */
function profile(data) {
  const repeats = 4096;
  /** @type {Record<'native'|'jsonValue'|'cborValue'|'rootIdentity',number[]>} */
  const values = {native: [], jsonValue: [], cborValue: [], rootIdentity: []};
  for (const variant of /** @type {const} */ (['native', 'jsonValue', 'cborValue', 'rootIdentity'])) sample(variant, data, 16);
  const orders = [
    /** @type {const} */ (['native', 'jsonValue', 'cborValue', 'rootIdentity']),
    /** @type {const} */ (['rootIdentity', 'native', 'jsonValue', 'cborValue']),
    /** @type {const} */ (['cborValue', 'rootIdentity', 'native', 'jsonValue']),
    /** @type {const} */ (['jsonValue', 'cborValue', 'rootIdentity', 'native'])
  ];
  for (let trial = 0; trial < 12; trial++) {
    /** @type {Record<string,number>} */
    const checksums = {};
    for (const variant of orders[trial % orders.length]) {
      const observation = sample(variant, data, repeats);
      if (observation.cpuMicros <= 0) throw new TypeError('CPU sample must be positive');
      values[variant].push(observation.cpuMicros);
      checksums[variant] = observation.checksum;
      if (variant === 'rootIdentity' && observation.identityPreserved !== true) {
        throw new TypeError('Root-identity arm failed to return original client argument');
      }
    }
    assert.equal(checksums.jsonValue, checksums.native);
    assert.equal(checksums.cborValue, checksums.native);
    assert.equal(checksums.rootIdentity, checksums.native);
  }
  return {
    repeats,
    rawCpuMicros: values,
    jsonValueVsNative: pairedBudgetBound(values.native, values.jsonValue),
    cborValueVsNative: pairedBudgetBound(values.native, values.cborValue),
    rootIdentityVsNative: pairedBudgetBound(values.native, values.rootIdentity),
    rootIdentityVsCborValue: pairedBudgetBound(values.cborValue, values.rootIdentity),
    strictBreaches: {
      jsonValueVsNative: strictBreaches(values.native, values.jsonValue),
      cborValueVsNative: strictBreaches(values.native, values.cborValue),
      rootIdentityVsNative: strictBreaches(values.native, values.rootIdentity)
    }
  };
}

/** @returns {object} */
function run() {
  return {
    node: process.version,
    platform: process.platform,
    package: 'cbor-x@1.6.9',
    options: {structuredClone: true, useRecords: false, alwaysUseFloat: true},
    semanticProbe: semanticProbe(),
    rows: [1, 32].map(count => ({count, profile: profile(payload(count))})),
    boundary: 'in-process cbor-x request/response plus task CPU; no HTTP, browser, auth, or compiler root-return proof'
  };
}

if (require.main === module) process.stdout.write('SCO_CBORX_ROOT_IDENTITY_PILOT ' + JSON.stringify(run()) + '\n');

module.exports = {cborWire, invokeCborValue, invokeRootIdentity, invokeJsonValue, semanticProbe, payload, task, profile, run};
