'use strict';

const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const vm = require('node:vm');
const {pairedBudgetBound} = require('./paired-budget-bound');

const ASSERTION_VALUE = 16416;
const WRONG_ASSERTION_VALUE = 16415;
const RANDOM_SEED = 0x6a09e667;

const SOURCE = `
var assertionValue = globalThis.__obfsAssertionValue;

/* @js-confuser-assert */
assertionValue === 16416;

function protectedWork(seed, rounds) {
  var x = seed | 0;
  var y = (seed ^ 0x5a5a5a5a) | 0;
  var index = 0;
  for (index = 0; index < rounds; index++) {
    x = Math.imul((x ^ index) | 0, 0x45d9f3b) | 0;
    y = Math.imul((y + x + index) | 0, 0x27d4eb2d) | 0;
    x = (x ^ (y >>> 11)) | 0;
  }
  var result = (x ^ y) | 0;
  return result;
}

module.exports = protectedWork;
`;

/** @returns {() => number} */
function fixedRandom() {
  let state = RANDOM_SEED >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

/**
 * @returns {Promise<{code:string,sha256:string,bytes:number}>}
 */
async function obfuscateDeterministic() {
  const originalRandom = Math.random;
  Math.random = fixedRandom();
  try {
    const JsConfuser = require('js-confuser');
    const result = await JsConfuser.obfuscate(SOURCE, {
      target: 'node',
      controlFlowFlattening: true,
      renameVariables: false
    });
    const code = result.code;
    assert.match(code, /while/u);
    return {
      code,
      sha256: createHash('sha256').update(code).digest('hex'),
      bytes: Buffer.byteLength(code)
    };
  } finally {
    Math.random = originalRandom;
  }
}

/**
 * Execute code in this realm while instrumenting the assertion source.
 * @param {string} code
 * @param {number} assertionValue
 * @returns {{fn:(seed:number,rounds:number)=>number,reads:number,observed:number[]}}
 */
function loadInstrumented(code, assertionValue) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, '__obfsAssertionValue');
  let reads = 0;
  /** @type {number[]} */
  const observed = [];
  Object.defineProperty(globalThis, '__obfsAssertionValue', {
    configurable: true,
    get() {
      reads++;
      observed.push(assertionValue);
      return assertionValue;
    }
  });
  try {
    const moduleRecord = {exports: /** @type {unknown} */ (null)};
    const execute = new Function('module', code);
    execute(moduleRecord);
    assert.equal(typeof moduleRecord.exports, 'function');
    return {
      fn: /** @type {(seed:number,rounds:number)=>number} */ (moduleRecord.exports),
      reads,
      observed
    };
  } finally {
    if (previous) {
      Object.defineProperty(globalThis, '__obfsAssertionValue', previous);
    } else {
      Reflect.deleteProperty(globalThis, '__obfsAssertionValue');
    }
  }
}

/**
 * @param {string} code
 * @param {number} assertionValue
 * @param {number} seed
 * @param {number} rounds
 * @returns {{initialized:boolean,callable:boolean,value:number|null,error:string|null,reads:number}}
 */
function isolatedRun(code, assertionValue, seed, rounds) {
  let reads = 0;
  const sandbox = {
    module: {exports: null},
    Math
  };
  Object.defineProperty(sandbox, '__obfsAssertionValue', {
    configurable: true,
    get() {
      reads++;
      return assertionValue;
    }
  });
  const context = vm.createContext(sandbox);
  try {
    new vm.Script(code).runInContext(context, {timeout: 750});
    const callable = typeof sandbox.module.exports === 'function';
    if (!callable) {
      return {initialized: true, callable: false, value: null, error: null, reads};
    }
    const value = vm.runInContext(
      `module.exports(${seed | 0}, ${rounds | 0})`,
      context,
      {timeout: 750}
    );
    return {
      initialized: true,
      callable: true,
      value: typeof value === 'number' ? value : null,
      error: null,
      reads
    };
  } catch (error) {
    return {
      initialized: false,
      callable: false,
      value: null,
      error: error instanceof Error ? error.name + ': ' + error.message : String(error),
      reads
    };
  }
}

/** @param {number} seed @param {number} rounds @returns {number} */
function nativeProtectedWork(seed, rounds) {
  let x = seed | 0;
  let y = (seed ^ 0x5a5a5a5a) | 0;
  for (let index = 0; index < rounds; index++) {
    x = Math.imul((x ^ index) | 0, 0x45d9f3b) | 0;
    y = Math.imul((y + x + index) | 0, 0x27d4eb2d) | 0;
    x = (x ^ (y >>> 11)) | 0;
  }
  return (x ^ y) | 0;
}

/**
 * @param {(seed:number,rounds:number)=>number} fn
 * @param {number} calls
 * @param {number} rounds
 * @returns {{cpuMicros:number,checksum:number}}
 */
function cpuSample(fn, calls, rounds) {
  let checksum = 0;
  const started = process.cpuUsage();
  for (let index = 0; index < calls; index++) {
    checksum = (checksum + fn((0x12345678 + index) | 0, rounds)) | 0;
  }
  const elapsed = process.cpuUsage(started);
  return {cpuMicros: elapsed.user + elapsed.system, checksum};
}

/** @param {number} rounds @returns {{calls:number,calibrationCpuMicros:number}} */
function calibrate(rounds) {
  let calls = 1024;
  let observation = cpuSample(nativeProtectedWork, calls, rounds);
  while (observation.cpuMicros < 30000 && calls < 32768) {
    calls *= 2;
    observation = cpuSample(nativeProtectedWork, calls, rounds);
  }
  return {calls, calibrationCpuMicros: observation.cpuMicros};
}

/**
 * @param {(seed:number,rounds:number)=>number} generated
 * @returns {object}
 */
function profile(generated) {
  const rounds = 256;
  const calibration = calibrate(rounds);
  const calls = calibration.calls;

  cpuSample(nativeProtectedWork, Math.min(calls, 2048), rounds);
  cpuSample(generated, Math.min(calls, 2048), rounds);

  /** @type {number[]} */
  const native = [];
  /** @type {number[]} */
  const candidate = [];
  for (let trial = 0; trial < 9; trial++) {
    const order = trial % 2 === 0 ?
      /** @type {const} */ (['native', 'candidate']) :
      /** @type {const} */ (['candidate', 'native']);
    /** @type {Record<string,number>} */
    const checksums = {};
    for (const arm of order) {
      const observation = cpuSample(
        arm === 'native' ? nativeProtectedWork : generated,
        calls,
        rounds
      );
      checksums[arm] = observation.checksum;
      (arm === 'native' ? native : candidate).push(observation.cpuMicros);
    }
    assert.equal(checksums.candidate, checksums.native);
  }

  return {
    rounds,
    ...calibration,
    rawCpuMicros: {native, candidate},
    zeroNativeSamples: native.filter(value => value === 0).length,
    bound: native.some(value => value === 0) ? null :
      pairedBudgetBound(native, candidate)
  };
}

/** @returns {Promise<object>} */
async function run() {
  const generated = await obfuscateDeterministic();

  const original = loadInstrumented(SOURCE, ASSERTION_VALUE);
  const legitimate = loadInstrumented(generated.code, ASSERTION_VALUE);
  assert.ok(legitimate.reads >= 1);
  assert.ok(legitimate.observed.every(value => value === ASSERTION_VALUE));

  const seed = 0x12345678;
  const rounds = 256;
  const expected = original.fn(seed, rounds);
  const legitimateValue = legitimate.fn(seed, rounds);
  assert.equal(legitimateValue, expected);

  const capturedValue = legitimate.observed[0];
  const replay = isolatedRun(generated.code, capturedValue, seed, rounds);
  assert.equal(replay.callable, true);
  assert.equal(replay.value, expected);

  const wrong = isolatedRun(generated.code, WRONG_ASSERTION_VALUE, seed, rounds);
  const wrongReproduces = wrong.callable && wrong.value === expected;

  return {
    node: process.version,
    platform: process.platform,
    package: 'js-confuser@2.1.3',
    options: {
      target: 'node',
      controlFlowFlattening: true,
      renameVariables: false
    },
    deterministicRandomSeed: '0x6a09e667',
    sourceBytes: Buffer.byteLength(SOURCE),
    generatedBytes: generated.bytes,
    generatedSha256: generated.sha256,
    assertion: {
      legitimateReads: legitimate.reads,
      legitimateObserved: legitimate.observed,
      capturedValue,
      replay,
      replayMatchesExpected: replay.value === expected,
      wrong,
      wrongReproducesExpected: wrongReproduces
    },
    fixedOutput: {seed, rounds, expected, legitimateValue},
    profile: profile(legitimate.fn)
  };
}

if (require.main === module) {
  run().then(result => {
    process.stdout.write('JSCONFUSER_CFF_ASSERTION ' + JSON.stringify(result) + '\n');
  }).catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  SOURCE,
  fixedRandom,
  obfuscateDeterministic,
  loadInstrumented,
  isolatedRun,
  nativeProtectedWork,
  cpuSample,
  calibrate,
  profile,
  run
};
