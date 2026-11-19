'use strict';

const assert = require('node:assert/strict');
const {Encoder, setSizeLimits} = require('cbor-x');

setSizeLimits({maxArraySize: 64, maxMapSize: 64, maxObjectSize: 64});

const encoder = new Encoder({
  structuredClone: true,
  useRecords: false,
  alwaysUseFloat: true
});

/** @param {unknown} value @returns {any} */
function roundtrip(value) {
  return encoder.decode(encoder.encode(value));
}

/** @param {() => unknown} operation @returns {{threw:boolean,name:string|null,message:string|null}} */
function observeThrow(operation) {
  try {
    operation();
    return {threw: false, name: null, message: null};
  } catch (error) {
    return {
      threw: true,
      name: error instanceof Error ? error.name : typeof error,
      message: error instanceof Error ? error.message : String(error)
    };
  }
}

/** @returns {object} */
function semanticEdges() {
  const ownProto = {};
  Object.defineProperty(ownProto, '__proto__', {
    value: {sentinel: 'own-data'},
    enumerable: true,
    writable: true,
    configurable: true
  });
  const restoredProto = roundtrip(ownProto);

  const nullProto = Object.create(null);
  nullProto.value = 7;
  const restoredNull = roundtrip(nullProto);

  const customPrototype = {inherited: 11};
  const custom = Object.create(customPrototype);
  custom.own = 13;
  const restoredCustom = roundtrip(custom);

  const symbol = Symbol('edge');
  /** @type {Record<PropertyKey,unknown>} */
  const withSymbol = {plain: 1};
  withSymbol[symbol] = 2;
  const restoredSymbol = roundtrip(withSymbol);

  const withHidden = {visible: 1};
  Object.defineProperty(withHidden, 'hidden', {
    value: 2,
    enumerable: false,
    writable: true,
    configurable: true
  });
  const restoredHidden = roundtrip(withHidden);

  const sparse = new Array(2);
  sparse[1] = undefined;
  const restoredSparse = roundtrip(sparse);

  let getterReads = 0;
  const withGetter = {};
  Object.defineProperty(withGetter, 'value', {
    enumerable: true,
    configurable: true,
    get() {
      getterReads++;
      return 17;
    }
  });
  const restoredGetter = roundtrip(withGetter);
  const getterDescriptor = Object.getOwnPropertyDescriptor(restoredGetter, 'value');

  const cleanObject = /** @type {any} */ ({});
  assert.equal(cleanObject.sentinel, undefined);

  return {
    ownProto: {
      originalOwn: Object.hasOwn(ownProto, '__proto__'),
      restoredOwnProto: Object.hasOwn(restoredProto, '__proto__'),
      restoredOwnProtoUnderscore: Object.hasOwn(restoredProto, '__proto_'),
      restoredKeys: Object.keys(restoredProto),
      globalPollution: cleanObject.sentinel ?? null
    },
    nullPrototype: {
      originalNull: Object.getPrototypeOf(nullProto) === null,
      restoredNull: Object.getPrototypeOf(restoredNull) === null,
      restoredPrototypeName: Object.getPrototypeOf(restoredNull)?.constructor?.name ?? null
    },
    customPrototype: {
      originalInherited: custom.inherited,
      restoredInherited: restoredCustom.inherited ?? null,
      samePrototype: Object.getPrototypeOf(restoredCustom) === customPrototype,
      restoredPrototypeName: Object.getPrototypeOf(restoredCustom)?.constructor?.name ?? null
    },
    symbolKey: {
      originalSymbols: Object.getOwnPropertySymbols(withSymbol).length,
      restoredSymbols: Object.getOwnPropertySymbols(restoredSymbol).length,
      restoredPlain: restoredSymbol.plain
    },
    nonEnumerable: {
      originalOwn: Object.hasOwn(withHidden, 'hidden'),
      restoredOwn: Object.hasOwn(restoredHidden, 'hidden'),
      restoredKeys: Object.keys(restoredHidden)
    },
    sparseArray: {
      originalZeroOwn: Object.hasOwn(sparse, 0),
      originalOneOwn: Object.hasOwn(sparse, 1),
      restoredZeroOwn: Object.hasOwn(restoredSparse, 0),
      restoredOneOwn: Object.hasOwn(restoredSparse, 1),
      restoredLength: restoredSparse.length
    },
    getter: {
      readsDuringRoundtrip: getterReads,
      restoredValue: restoredGetter.value,
      restoredHasGetter: typeof getterDescriptor?.get === 'function',
      restoredDescriptorEnumerable: getterDescriptor?.enumerable ?? null
    }
  };
}

/** @returns {object} */
function parserResources() {
  const array65 = Buffer.concat([Buffer.from([0x98, 65]), Buffer.alloc(65, 0xf6)]);
  const map65 = Buffer.concat([Buffer.from([0xb8, 65]), Buffer.alloc(130, 0xf6)]);
  const oversizeArray = observeThrow(() => encoder.decode(array65));
  const oversizeMap = observeThrow(() => encoder.decode(map65));

  /** @type {Array<{depth:number,bytes:number,outcome:{threw:boolean,name:string|null,message:string|null}}>} */
  const nested = [];
  for (const depth of [64, 256, 1024, 4096, 8192]) {
    const source = Buffer.alloc(depth + 1, 0x81);
    source[source.length - 1] = 0xf6;
    nested.push({
      depth,
      bytes: source.length,
      outcome: observeThrow(() => encoder.decode(source))
    });
  }

  assert.equal(oversizeArray.threw, true);
  assert.match(oversizeArray.message ?? '', /Array length exceeds 64/u);
  assert.equal(oversizeMap.threw, true);
  assert.match(oversizeMap.message ?? '', /(Property count|Map size) exceeds 64/u);

  return {oversizeArray, oversizeMap, nested};
}

/** @returns {object} */
function run() {
  return {
    node: process.version,
    platform: process.platform,
    package: 'cbor-x@1.6.9',
    limits: {maxArraySize: 64, maxMapSize: 64, maxObjectSize: 64},
    semanticEdges: semanticEdges(),
    parserResources: parserResources()
  };
}

if (require.main === module) {
  process.stdout.write('SCO_CBORX_EDGE_BOUNDARY ' + JSON.stringify(run()) + '\n');
}

module.exports = {roundtrip, observeThrow, semanticEdges, parserResources, run};
