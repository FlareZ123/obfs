/*
 * Standalone Node 22 active-frame controls extending the Agent 24 matrix.
 * Intentionally sloppy CommonJS: the legacy caller-capture cases require it.
 */
const assert = require('node:assert/strict');

/**
 * @typedef {{functionName:string|null, source:string|null}} CallerObservation
 * @typedef {{name:string|null, hasFunction:boolean, source:string|null,
 *   file:string|null, line:number|null, column:number|null}} StackFrame
 * @typedef {{frames:StackFrame[]}} StackObservation
 */

/** @returns {{observation:CallerObservation, external:Function}} */
function makeCallerCapture() {
  /** @type {CallerObservation} */
  const observation = { functionName: null, source: null };
  const external = Function('observation',
    'return function external(){' +
    'const caller=arguments.callee.caller;' +
    'const active=caller&&caller.caller;' +
    'observation.functionName=active?active.name:null;' +
    'observation.source=active?Function.prototype.toString.call(active):null;' +
    '}')(observation);
  return { observation, external };
}

/** @returns {{observation:StackObservation, external:Function}} */
function makeStackCapture() {
  /** @type {StackObservation} */
  const observation = { frames: [] };
  const external = Function('observation',
    'return function external(){' +
    'const previous=Error.prepareStackTrace;' +
    'try{' +
    'Error.prepareStackTrace=(_error,sites)=>sites;' +
    'const sites=new Error().stack;' +
    'observation.frames=sites.map(site=>({' +
    'name:site.getFunctionName()||null,' +
    'hasFunction:Boolean(site.getFunction()),' +
    'source:site.getFunction()?Function.prototype.toString.call(site.getFunction()):null,' +
    'file:site.getFileName()||null,' +
    'line:site.getLineNumber()||null,' +
    'column:site.getColumnNumber()||null' +
    '}));' +
    '}finally{Error.prepareStackTrace=previous;}' +
    '}')(observation);
  return { observation, external };
}

/**
 * @param {string} label
 * @param {(external:Function)=>object} makeValue
 * @param {(value:object)=>unknown} hidden
 * @param {string} expectedFragment
 * @returns {{label:string, functionName:string, exactSource:boolean}}
 */
function runCallerCase(label, makeValue, hidden, expectedFragment) {
  const { observation, external } = makeCallerCapture();
  hidden(makeValue(external));
  assert.equal(observation.functionName, hidden.name, label + ': caller chain');
  assert.ok(observation.source && observation.source.includes(expectedFragment),
    label + ': exact source capture');
  return { label, functionName: observation.functionName, exactSource: true };
}

/**
 * @param {string} label
 * @param {(value:object)=>Promise<unknown>} hidden
 * @param {boolean} expectFunction
 * @returns {Promise<{label:string, functionName:string, hasFunction:boolean,
 *   framePosition:boolean, exactSource:boolean}>}
 */
async function runThenableCase(label, hidden, expectFunction) {
  const { observation, external } = makeStackCapture();
  const thenable = Object.defineProperty({}, 'then', {
    configurable: true,
    get() {
      external();
      return resolve => resolve();
    }
  });
  await hidden(thenable);
  const frame = observation.frames.find(item => item.name === hidden.name);
  assert.ok(frame, label + ': async frame present');
  assert.equal(frame.hasFunction, expectFunction, label + ': CallSite.getFunction');
  assert.ok(frame.file && frame.line && frame.column, label + ': frame position');
  if (expectFunction) {
    assert.ok(frame.source && frame.source.includes(hidden.name), label + ': exact source');
  } else {
    assert.equal(frame.source, null, label + ': strict frame object hidden');
  }
  return {
    label,
    functionName: frame.name,
    hasFunction: frame.hasFunction,
    framePosition: true,
    exactSource: Boolean(frame.source)
  };
}

/**
 * @param {string} label
 * @param {string} trapName
 * @param {(value:object)=>unknown} hidden
 * @param {boolean} expectThrow
 * @returns {{label:string, functionName:string, framePosition:boolean,
 *   exactSource:boolean, threw:boolean}}
 */
function runProxyCase(label, trapName, hidden, expectThrow) {
  const { observation, external } = makeStackCapture();
  const trap = Function('external',
    'return function ' + trapName + '(target,...args){external();return true;}')(external);
  const proxy = new Proxy({}, { [trapName]: trap });
  let threw = false;
  try {
    hidden(proxy);
  } catch (error) {
    threw = true;
    assert.ok(error instanceof TypeError, label + ': expected invariant TypeError');
  }
  assert.equal(threw, expectThrow, label + ': throw expectation');
  const frame = observation.frames.find(item => item.name === hidden.name);
  assert.ok(frame, label + ': active frame position');
  assert.ok(frame.file && frame.line && frame.column, label + ': file/line/column');
  assert.equal(frame.hasFunction, false, label + ': native intrinsic hides function object');
  return {
    label,
    functionName: frame.name,
    framePosition: true,
    exactSource: false,
    threw
  };
}

function hiddenPlus(value) { return value + 1; }
function hiddenRel(value) { return value < 2; }
function hiddenKey(value) { const obj = { x: 1 }; return obj[value]; }
function hiddenValueOf(value) { return value - 1; }
function hiddenString(value) { return '' + value; }

async function hiddenAwaitSloppy(value) { await value; }
async function hiddenAwaitStrict(value) { 'use strict'; await value; }
async function hiddenReturnSloppy(value) { return value; }

function hiddenDefine(value) {
  Object.defineProperty(value, 'x', { value: 1, configurable: true });
}
function hiddenSetProto(value) { Object.setPrototypeOf(value, {}); }
function hiddenPrevent(value) { Object.preventExtensions(value); }
function hiddenIsExtensible(value) { return Object.isExtensible(value); }

/** @returns {Promise<void>} */
async function main() {
  const coercion = [
    runCallerCase('plus-Symbol.toPrimitive', external => ({
      [Symbol.toPrimitive]: function toPrimitive() { external(); return 1; }
    }), hiddenPlus, 'return value + 1'),
    runCallerCase('relational-Symbol.toPrimitive', external => ({
      [Symbol.toPrimitive]: function toPrimitive() { external(); return 1; }
    }), hiddenRel, 'return value < 2'),
    runCallerCase('computed-key-ToPropertyKey', external => ({
      [Symbol.toPrimitive]: function toPrimitive() { external(); return 'x'; }
    }), hiddenKey, 'return obj[value]'),
    runCallerCase('numeric-valueOf-fallback', external => ({
      valueOf: function valueOf() { external(); return 1; }
    }), hiddenValueOf, 'return value - 1'),
    runCallerCase('string-toString-fallback', external => ({
      valueOf: function valueOf() { return {}; },
      toString: function toString() { external(); return '1'; }
    }), hiddenString, "return '' + value")
  ];

  const thenable = [
    await runThenableCase('await-sloppy-then-getter', hiddenAwaitSloppy, true),
    await runThenableCase('await-strict-then-getter', hiddenAwaitStrict, false),
    await runThenableCase('async-return-then-getter', hiddenReturnSloppy, true)
  ];

  const proxy = [
    runProxyCase('Object.defineProperty', 'defineProperty', hiddenDefine, false),
    runProxyCase('Object.setPrototypeOf', 'setPrototypeOf', hiddenSetProto, false),
    runProxyCase('Object.preventExtensions', 'preventExtensions', hiddenPrevent, true),
    runProxyCase('Object.isExtensible', 'isExtensible', hiddenIsExtensible, false)
  ];

  const result = {
    node: process.version,
    coercion,
    thenable,
    proxy,
    totals: { coercion: coercion.length, thenable: thenable.length, proxy: proxy.length }
  };
  process.stdout.write('AGENT50_IMPLICIT_DISPATCH_EXTENSION ' + JSON.stringify(result) + '\n');
}

main().catch(error => {
  process.stderr.write(String(error && error.stack || error) + '\n');
  process.exitCode = 1;
});
