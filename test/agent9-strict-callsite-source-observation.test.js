'use strict';

const assert = require('node:assert/strict');
const {test} = require('node:test');
const {obfuscateFiles} = require('../src');

/**
 * @typedef {{name:string|null,functionType:string,source:string|null,thisIsUndefined:boolean}} ObservedFrame
 */

/**
 * Execute a CommonJS source in the same V8 realm as a host-owned stack
 * formatter, which attempts to recover the active function through
 * CallSite#getFunction and its receiver through CallSite#getThis.
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
        functionType: typeof fn,
        source: typeof fn === 'function' ? Function.prototype.toString.call(fn) : null,
        thisIsUndefined: hidden.getThis() === undefined
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
    new Function('getExternal', 'module', code)(getExternal, module);
    return {value: module.exports, frames};
  } finally {
    Error.prepareStackTrace = previous;
  }
}

const modes = /** @type {const} */ (['coo', 'sco', 'sno']);

for (const mode of modes) {
  for (const strict of [false, true]) {
    test(mode + ' V8 CallSite function and receiver visibility (' + strict + ')', () => {
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
        // Strict frames expose names but not their function object or receiver.
        assert.deepEqual(native.frames, [{
          name: 'hidden', functionType: 'undefined', source: null, thisIsUndefined: true
        }], mode);
        assert.deepEqual(emitted.frames, native.frames, mode);
      } else {
        // Record whether this V8 build exposes sloppy function objects.
        assert.equal(native.frames[0].thisIsUndefined, false, mode);
        assert.equal(emitted.frames[0].thisIsUndefined, false, mode);
        if (native.frames[0].functionType === 'function') {
          assert.match(native.frames[0].source || '', /owner\.secretField/, mode);
          assert.notEqual(emitted.frames[0].source, native.frames[0].source, mode);
          assert.doesNotMatch(emitted.frames[0].source || '', /owner\.secretField/, mode);
        } else {
          assert.equal(native.frames[0].source, null, mode);
          assert.equal(emitted.frames[0].source, null, mode);
        }
      }

      console.log('AGENT9_CALLSITE_VISIBILITY ' + JSON.stringify({
        node: process.version,
        v8: process.versions.v8,
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
