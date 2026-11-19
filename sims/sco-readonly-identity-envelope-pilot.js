'use strict';

const assert = require('node:assert/strict');
const {pairedBudgetBound} = require('./paired-budget-bound');

/** @typedef {['p',null|boolean|string|number]|['u']|['n',string]|['b',string]|['r',string]|['c',string]} WireValue */
/** @typedef {{id:string,kind:'array'|'object'|'null-object',length?:number,entries:Array<[string,WireValue]>}} WireNode */
/** @typedef {{roots:WireValue[],nodes:WireNode[]}} WireGraph */

/** @returns {{objectToId:WeakMap<object,string>,idToObject:Map<string,object>,nextId:number}} */
function createClientSession() {
  return {objectToId: new WeakMap(), idToObject: new Map(), nextId: 1};
}

/** @param {unknown} value @returns {WireValue} */
function encodeScalar(value) {
  if (value === undefined) return ['u'];
  if (value === null) return ['p', null];
  if (typeof value === 'boolean' || typeof value === 'string') return ['p', value];
  if (typeof value === 'number') {
    if (Object.is(value, -0)) return ['n', '-0'];
    if (Number.isNaN(value)) return ['n', 'nan'];
    if (value === Infinity) return ['n', 'inf'];
    if (value === -Infinity) return ['n', '-inf'];
    return ['p', value];
  }
  if (typeof value === 'bigint') return ['b', value.toString()];
  throw new TypeError('Unsupported scalar in identity envelope');
}

/** @param {object} value @returns {'array'|'object'|'null-object'} */
function objectKind(value) {
  if (Array.isArray(value)) return 'array';
  const prototype = Object.getPrototypeOf(value);
  if (prototype === Object.prototype) return 'object';
  if (prototype === null) return 'null-object';
  throw new TypeError('Identity envelope requires Array, Object, or null-prototype objects');
}

/** @param {object} value @returns {void} */
function assertAdmittedObject(value) {
  objectKind(value);
  if (Object.getOwnPropertySymbols(value).length) throw new TypeError('Identity envelope refuses symbol properties');
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || Array.isArray(value) && key === 'length') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || descriptor.enumerable !== true || !Object.hasOwn(descriptor, 'value')) {
      throw new TypeError('Identity envelope requires enumerable own data properties');
    }
  }
}

/**
 * @param {unknown[]} roots
 * @param {{objectToId:WeakMap<object,string>,idToObject:Map<string,object>,nextId:number}} session
 * @returns {WireGraph}
 */
function encodeClientGraph(roots, session) {
  /** @type {WireNode[]} */
  const nodes = [];
  /** @type {Set<string>} */
  const emitted = new Set();

  /** @param {unknown} value @returns {WireValue} */
  function encode(value) {
    if (typeof value !== 'object' || value === null) return encodeScalar(value);
    assertAdmittedObject(value);
    let id = session.objectToId.get(value);
    if (!id) {
      id = 'c' + session.nextId++;
      session.objectToId.set(value, id);
      session.idToObject.set(id, value);
    }
    if (!emitted.has(id)) {
      emitted.add(id);
      const kind = objectKind(value);
      /** @type {WireNode} */
      const node = {id, kind, entries: []};
      if (Array.isArray(value)) node.length = value.length;
      nodes.push(node);
      const indexed = /** @type {Record<string,unknown>} */ (value);
      for (const key of Object.keys(value)) node.entries.push([key, encode(indexed[key])]);
    }
    return ['r', id];
  }

  return {roots: roots.map(encode), nodes};
}

/**
 * @param {unknown[]} roots
 * @param {WeakMap<object,string>} existingIds
 * @returns {WireGraph}
 */
function encodeFullServerGraph(roots, existingIds) {
  /** @type {WireNode[]} */
  const nodes = [];
  /** @type {Map<object,string>} */
  const newIds = new Map();
  /** @type {Set<string>} */
  const emitted = new Set();
  let nextNew = 1;

  /** @param {unknown} value @returns {WireValue} */
  function encode(value) {
    if (typeof value !== 'object' || value === null) return encodeScalar(value);
    assertAdmittedObject(value);
    let id = existingIds.get(value) ?? newIds.get(value);
    if (!id) {
      id = 'r' + nextNew++;
      newIds.set(value, id);
    }
    if (!emitted.has(id)) {
      emitted.add(id);
      const kind = objectKind(value);
      /** @type {WireNode} */
      const node = {id, kind, entries: []};
      if (Array.isArray(value)) node.length = value.length;
      nodes.push(node);
      const indexed = /** @type {Record<string,unknown>} */ (value);
      for (const key of Object.keys(value)) node.entries.push([key, encode(indexed[key])]);
    }
    return ['r', id];
  }

  return {roots: roots.map(encode), nodes};
}

/**
 * @param {unknown[]} roots
 * @param {WeakMap<object,string>} existingIds
 * @returns {WireGraph}
 */
function encodeReadOnlyServerGraph(roots, existingIds) {
  /** @type {WireNode[]} */
  const nodes = [];
  /** @type {Map<object,string>} */
  const newIds = new Map();
  /** @type {Set<string>} */
  const emitted = new Set();
  let nextNew = 1;

  /** @param {unknown} value @returns {WireValue} */
  function encode(value) {
    if (typeof value !== 'object' || value === null) return encodeScalar(value);
    assertAdmittedObject(value);
    const existingId = existingIds.get(value);
    if (existingId) return ['c', existingId];
    let id = newIds.get(value);
    if (!id) {
      id = 'r' + nextNew++;
      newIds.set(value, id);
    }
    if (!emitted.has(id)) {
      emitted.add(id);
      const kind = objectKind(value);
      /** @type {WireNode} */
      const node = {id, kind, entries: []};
      if (Array.isArray(value)) node.length = value.length;
      nodes.push(node);
      const indexed = /** @type {Record<string,unknown>} */ (value);
      for (const key of Object.keys(value)) node.entries.push([key, encode(indexed[key])]);
    }
    return ['r', id];
  }

  return {roots: roots.map(encode), nodes};
}

/** @param {WireValue} value @param {Map<string,object>} objects @returns {unknown} */
function decodeValue(value, objects) {
  if (value[0] === 'p') return value[1];
  if (value[0] === 'u') return undefined;
  if (value[0] === 'b') return BigInt(value[1]);
  if (value[0] === 'n') {
    if (value[1] === '-0') return -0;
    if (value[1] === 'nan') return NaN;
    if (value[1] === 'inf') return Infinity;
    if (value[1] === '-inf') return -Infinity;
    throw new TypeError('Unknown numeric tag');
  }
  if (value[0] === 'c') throw new TypeError('Client reference is invalid in a full graph decode');
  const object = objects.get(value[1]);
  if (!object) throw new TypeError('Unknown graph reference');
  return object;
}

/** @param {object} object @returns {void} */
function clearAdmittedObject(object) {
  if (Array.isArray(object)) {
    for (const key of Object.keys(object)) Reflect.deleteProperty(object, key);
    object.length = 0;
    return;
  }
  for (const key of Object.keys(object)) Reflect.deleteProperty(object, key);
}

/** @param {object} object @param {string} key @param {unknown} value @returns {void} */
function defineData(object, key, value) {
  Object.defineProperty(object, key, {value, enumerable: true, writable: true, configurable: true});
}

/**
 * @param {WireGraph} graph
 * @param {Map<string,object>} [reuse]
 * @returns {{roots:unknown[],objectIds:WeakMap<object,string>,idToObject:Map<string,object>}}
 */
function decodeFullGraph(graph, reuse = new Map()) {
  /** @type {Map<string,object>} */
  const objects = new Map();
  /** @type {WeakMap<object,string>} */
  const objectIds = new WeakMap();

  for (const node of graph.nodes) {
    const existing = reuse.get(node.id);
    const object = /** @type {object} */ (existing ??
      (node.kind === 'array' ? [] : node.kind === 'null-object' ? Object.create(null) : {}));
    if (existing !== undefined) {
      if (objectKind(existing) !== node.kind) throw new TypeError('Graph kind changed across RPC boundary');
      clearAdmittedObject(existing);
    }
    objects.set(node.id, object);
    objectIds.set(object, node.id);
  }

  for (const node of graph.nodes) {
    const object = objects.get(node.id);
    if (!object) throw new TypeError('Missing allocated graph node');
    if (Array.isArray(object)) object.length = node.length ?? 0;
    for (const [key, encoded] of node.entries) defineData(object, key, decodeValue(encoded, objects));
  }

  return {roots: graph.roots.map(value => decodeValue(value, objects)), objectIds, idToObject: objects};
}

/**
 * @param {WireGraph} graph
 * @param {Map<string,object>} clientObjects
 * @returns {unknown[]}
 */
function decodeReadOnlyResponse(graph, clientObjects) {
  /** @type {Map<string,object>} */
  const responseObjects = new Map();

  for (const node of graph.nodes) {
    if (!node.id.startsWith('r')) throw new TypeError('Read-only response nodes must be server-owned');
    const object = node.kind === 'array' ? [] : node.kind === 'null-object' ? Object.create(null) : {};
    responseObjects.set(node.id, object);
  }

  /** @param {WireValue} value @returns {unknown} */
  function decode(value) {
    if (value[0] === 'c') {
      const object = clientObjects.get(value[1]);
      if (!object) throw new TypeError('Unknown client object reference');
      return object;
    }
    if (value[0] === 'r') {
      const object = responseObjects.get(value[1]);
      if (!object) throw new TypeError('Unknown response object reference');
      return object;
    }
    return decodeValue(value, responseObjects);
  }

  for (const node of graph.nodes) {
    const object = responseObjects.get(node.id);
    if (!object) throw new TypeError('Missing response node');
    if (Array.isArray(object)) object.length = node.length ?? 0;
    for (const [key, encoded] of node.entries) defineData(object, key, decode(encoded));
  }

  return graph.roots.map(decode);
}

/** @param {WireGraph} graph @returns {WireGraph} */
function jsonTransport(graph) {
  return /** @type {WireGraph} */ (JSON.parse(JSON.stringify(graph)));
}

/**
 * @param {(...args:any[])=>unknown} task
 * @param {unknown[]} args
 * @param {ReturnType<typeof createClientSession>} session
 * @returns {unknown}
 */
function invokeFullIdentity(task, args, session) {
  const request = jsonTransport(encodeClientGraph(args, session));
  const server = decodeFullGraph(request);
  const result = task(...server.roots);
  const response = jsonTransport(encodeFullServerGraph([result, ...server.roots], server.objectIds));
  const client = decodeFullGraph(response, session.idToObject);
  return client.roots[0];
}

/**
 * @param {(...args:any[])=>unknown} task
 * @param {unknown[]} args
 * @param {ReturnType<typeof createClientSession>} session
 * @returns {unknown}
 */
function invokeReadOnlyIdentity(task, args, session) {
  const request = jsonTransport(encodeClientGraph(args, session));
  const server = decodeFullGraph(request);
  const result = task(...server.roots);
  const response = jsonTransport(encodeReadOnlyServerGraph([result], server.objectIds));
  return decodeReadOnlyResponse(response, session.idToObject)[0];
}

/** @returns {object} */
function semanticProbe() {
  const session = createClientSession();
  /** @type {any[]} */
  const shared = [];
  shared.push(shared, -0, undefined, NaN, 12345678901234567890n);
  Object.defineProperty(shared, '__proto__', {value: 'own-proto-data', enumerable: true, writable: true, configurable: true});

  const echo = invokeReadOnlyIdentity(value => value, [shared], session);
  assert.strictEqual(echo, shared);

  const alias = {count: 1};
  const aliasResult = /** @type {{same:boolean}} */ (invokeReadOnlyIdentity((a, b) => ({same: a === b}), [alias, alias], session));
  assert.equal(aliasResult.same, true);

  const sparse = new Array(3);
  sparse[2] = 7;
  const sparseResult = /** @type {{hole0:boolean,hole1:boolean,value:number}} */ (invokeReadOnlyIdentity(value => ({
    hole0: !Object.hasOwn(value, 0),
    hole1: !Object.hasOwn(value, 1),
    value: value[2]
  }), [sparse], session));
  assert.deepEqual(sparseResult, {hole0: true, hole1: true, value: 7});

  const nested = {value: 9};
  const source = {nested};
  const nestedResult = invokeReadOnlyIdentity(value => value.nested, [source], session);
  assert.strictEqual(nestedResult, nested);

  const mixed = /** @type {any} */ (invokeReadOnlyIdentity(value => {
    /** @type {any} */
    const created = {original: value.nested};
    created.self = created;
    created.left = {x: 1};
    created.right = created.left;
    return created;
  }, [source], session));
  assert.notStrictEqual(mixed, source);
  assert.strictEqual(mixed.original, nested);
  assert.strictEqual(mixed.self, mixed);
  assert.strictEqual(mixed.left, mixed.right);

  const special = /** @type {any} */ (invokeReadOnlyIdentity(value => ({
    negativeZero: value[1], missing: value[2], nan: value[3], bigint: value[4],
    cycle: value[0] === value,
    ownProto: Object.hasOwn(value, '__proto__'),
    protoValue: value.__proto__
  }), [shared], session));
  assert.equal(Object.is(special.negativeZero, -0), true);
  assert.equal(special.missing, undefined);
  assert.equal(Number.isNaN(special.nan), true);
  assert.equal(special.bigint, 12345678901234567890n);
  assert.equal(special.cycle, true);
  assert.equal(special.ownProto, true);
  assert.equal(special.protoValue, 'own-proto-data');

  const getter = {};
  Object.defineProperty(getter, 'value', {enumerable: true, get() { return 1; }});
  assert.throws(() => invokeReadOnlyIdentity(value => value, [getter], createClientSession()), TypeError);

  return {
    echoIdentity: echo === shared,
    aliasObservedServerSide: aliasResult.same,
    sparseHoles: sparseResult.hole0 && sparseResult.hole1,
    nestedIdentity: nestedResult === nested,
    mixedOriginalIdentity: mixed.original === nested,
    newCycle: mixed.self === mixed,
    newAlias: mixed.left === mixed.right,
    negativeZero: Object.is(special.negativeZero, -0),
    undefined: special.missing === undefined,
    nan: Number.isNaN(special.nan),
    bigint: special.bigint === 12345678901234567890n,
    requestCycle: special.cycle,
    ownProto: special.ownProto && special.protoValue === 'own-proto-data',
    getterRejected: true
  };
}

/** @param {number} count @returns {{category:string,records:Array<{index:number,label:string,quantity:number}>}} */
function payload(count) {
  return {
    category: 'readonly-identity-envelope',
    records: Array.from({length: count}, (_, index) => ({
      index,
      label: 'event-' + index,
      quantity: Math.imul(index + 1, 2654435761) | 0
    }))
  };
}

/** @param {{records:Array<{index:number,label:string,quantity:number}>}} data @returns {{index:number,label:string,quantity:number}} */
function task(data) {
  let state = 0x13579bdf;
  for (const record of data.records) {
    state = Math.imul((state ^ record.quantity ^ record.index) | 0, 0x45d9f3b) | 0;
    state = (state + record.label.length) | 0;
  }
  for (let round = 0; round < 25000; round++) state = Math.imul((state ^ round) | 0, 0x27d4eb2d) | 0;
  if (state === 0x7fffffff) throw new Error('Unreachable state guard');
  const first = data.records[0];
  if (!first) throw new RangeError('Payload must contain at least one record');
  return first;
}

/**
 * @param {'native'|'json'|'fullIdentity'|'readOnlyIdentity'} variant
 * @param {ReturnType<typeof payload>} data
 * @param {number} repeats
 * @param {{full:ReturnType<typeof createClientSession>,readOnly:ReturnType<typeof createClientSession>}} sessions
 * @returns {{cpuMicros:number,checksum:number,identityPreserved:boolean|null}}
 */
function sample(variant, data, repeats, sessions) {
  let checksum = 0;
  let identityPreserved = null;
  const expected = data.records[0];
  const started = process.cpuUsage();
  for (let index = 0; index < repeats; index++) {
    let result;
    if (variant === 'native') result = task(data);
    else if (variant === 'json') result = task(/** @type {ReturnType<typeof payload>} */ (JSON.parse(JSON.stringify(data))));
    else if (variant === 'fullIdentity') result = /** @type {ReturnType<typeof task>} */ (invokeFullIdentity(task, [data], sessions.full));
    else result = /** @type {ReturnType<typeof task>} */ (invokeReadOnlyIdentity(task, [data], sessions.readOnly));
    checksum = (checksum + result.quantity + result.label.length) | 0;
    if (variant === 'fullIdentity' || variant === 'readOnlyIdentity') {
      const same = result === expected;
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
  const sessions = {full: createClientSession(), readOnly: createClientSession()};
  /** @type {Record<'native'|'json'|'fullIdentity'|'readOnlyIdentity',number[]>} */
  const values = {native: [], json: [], fullIdentity: [], readOnlyIdentity: []};
  for (const variant of /** @type {const} */ (['native', 'json', 'fullIdentity', 'readOnlyIdentity'])) sample(variant, data, 16, sessions);
  const orders = [
    /** @type {const} */ (['native', 'json', 'fullIdentity', 'readOnlyIdentity']),
    /** @type {const} */ (['readOnlyIdentity', 'native', 'json', 'fullIdentity']),
    /** @type {const} */ (['fullIdentity', 'readOnlyIdentity', 'native', 'json']),
    /** @type {const} */ (['json', 'fullIdentity', 'readOnlyIdentity', 'native'])
  ];
  for (let trial = 0; trial < 12; trial++) {
    /** @type {Record<string,number>} */
    const checksums = {};
    for (const variant of orders[trial % orders.length]) {
      const observation = sample(variant, data, repeats, sessions);
      if (observation.cpuMicros <= 0) throw new TypeError('CPU sample must be positive');
      values[variant].push(observation.cpuMicros);
      checksums[variant] = observation.checksum;
      if ((variant === 'fullIdentity' || variant === 'readOnlyIdentity') && observation.identityPreserved !== true) {
        throw new TypeError(variant + ' failed to preserve returned client object identity');
      }
    }
    assert.equal(checksums.json, checksums.native);
    assert.equal(checksums.fullIdentity, checksums.native);
    assert.equal(checksums.readOnlyIdentity, checksums.native);
  }
  return {
    repeats,
    rawCpuMicros: values,
    jsonVsNative: pairedBudgetBound(values.native, values.json),
    fullIdentityVsNative: pairedBudgetBound(values.native, values.fullIdentity),
    readOnlyIdentityVsNative: pairedBudgetBound(values.native, values.readOnlyIdentity),
    readOnlyIdentityVsFull: pairedBudgetBound(values.fullIdentity, values.readOnlyIdentity),
    strictBreaches: {
      jsonVsNative: strictBreaches(values.native, values.json),
      fullIdentityVsNative: strictBreaches(values.native, values.fullIdentity),
      readOnlyIdentityVsNative: strictBreaches(values.native, values.readOnlyIdentity)
    }
  };
}

/** @returns {object} */
function run() {
  return {
    node: process.version,
    platform: process.platform,
    semanticProbe: semanticProbe(),
    rows: [1, 32].map(count => ({count, profile: profile(payload(count))})),
    boundary: 'in-process JSON graph encode/decode plus task CPU; no HTTP, browser, auth, or compiler read-only proof'
  };
}

if (require.main === module) process.stdout.write('SCO_READONLY_IDENTITY_PILOT ' + JSON.stringify(run()) + '\n');

module.exports = {createClientSession, encodeClientGraph, encodeReadOnlyServerGraph, invokeReadOnlyIdentity, semanticProbe, payload, task, profile, run};
