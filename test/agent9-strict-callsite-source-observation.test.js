'use strict';

const assert = require('node:assert/strict');
const {test} = require('node:test');
const {obfuscateFiles} = require('../src');

/**
 * @typedef {{name:string|null,source:string|null}} ObservedFrame
 */

/**
 * Execute a CommonJS source in the same V8 realm as a host-owned stack
 * formatter, which attempts to recover the active function through
 * CallSite#getFunction.
 * @param {string} code
 * @returns {{value:unknown,frames:ObservedFrame[]}}
 */
function runWithCallSiteObserver(code) {
  const previous = Error.prepareStackTrace;
  /** @type {ObservedFrame[]} */
  const frames = [];
  Error.prepareStackTrace = (_error, sites) => {
    const hidden = sites.find(site => site.getFunctionName() === 'hidden');
    if (hidden) {
      const fn = hidden.getFunction();
      frames.push({
        name: hidden.getFunctionName(),
        source: typeof fn === 'function' ? Function.prototype.toString.call(fn) : null
      });
    }
    return 'captured';
  };
  try {
    const module = {exports: null};
    const getExternal = () => {
      const error = new Error('host CallSite source probe');
      void error.stack;
    };
    // Function creates the fixture in the same realm as Error.prepareStackTrace.
    // A leading directive makes the wrapper and nested hidden function strict.
    new Function('getExternal', 'module', code)(getExternal, module);
    return {value: module.exports, frames};
  } finally {
    Error.prepareStackTrace = previous;
  }
}

const modes = /** @type {const} */ (['coo', 'sco', 'sno']);

for (const mode of modes) {
  for (const strict of [false, true]) {
    test(mode + ' V8 CallSite source access is available to sloppy functions but not strict functions (' + strict + ')', () => {
      const source = [
        strict ? "'use strict';" : '',
        'const owner = {secretField: 17, unrelatedField: 23};',
        'function hidden() { /* strict-callsite-source-marker */ getExternal(); return owner.secretField; }',
        'module.exports = hidden() + 4;'
      ].filter(Boolean).join('\n');
      const output = obfuscateFiles([{
        path: 'entry.cjs',
        sourceType: 'commonjs',
        code: source
      }], {
        mode,
        closedWorld: true,
        properties: true,
        identifiers: false,
        strings: false,
        seed: 'agent9-strict-callsite-' + mode + '-' + strict
      }).files[0];

      assert.ok(output.metrics.properties >= 1, mode + ': expected private owner property rewrite');
      assert.ok(!output.code.includes('secretField'), mode + ': transformed output should not retain the private key spelling');

      const native = runWithCallSiteObserver(source);
      const emitted = runWithCallSiteObserver(String(output.code));
      assert.equal(native.value, 21, mode);
      assert.equal(emitted.value, native.value, mode);
      assert.deepEqual(native.frames.map(frame => frame.name), ['hidden'], mode);
      assert.deepEqual(emitted.frames.map(frame => frame.name), ['hidden'], mode);

      if (strict) {
        // V8 exposes frame metadata but withholds the strict function object.
        assert.deepEqual(native.frames, [{name: 'hidden', source: null}], mode);
        assert.deepEqual(emitted.frames, [{name: 'hidden', source: null}], mode);
      } else {
        // The same host-owned CallSite API recovers sloppy function source.
        assert.match(native.frames[0].source || '', /owner\.secretField/, mode);
        assert.notEqual(emitted.frames[0].source, native.frames[0].source, mode);
        assert.doesNotMatch(emitted.frames[0].source || '', /owner\.secretField/, mode);
      }

      console.log('AGENT9_STRICT_CALLSITE ' + JSON.stringify({
        mode,
        strict,
        propertyRewrites: output.metrics.properties,
        nativeFrame: native.frames[0],
        emittedFrame: emitted.frames[0],
        runtimeValue: emitted.value
      }));
    });
  }
}
