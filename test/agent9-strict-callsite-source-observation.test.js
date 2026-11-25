'use strict';

const assert = require('node:assert/strict');
const {test} = require('node:test');
const {obfuscateFiles} = require('../src');

/**
 * @typedef {{name:string|null,functionType:string,source:string|null,column:number|null}} ObservedFrame
 */

/**
 * Execute a CommonJS source in the same V8 realm as a host-owned stack
 * formatter, which inspects the active function's CallSite metadata.
 * The host callback is deliberately sloppy: V8 hides getFunction() for
 * strict frames and frames below a strict frame.
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
        column: hidden.getColumnNumber()
      });
    }
    return 'captured';
  };
  try {
    const module = {exports: null};
    // Use a sloppy host callback so it does not hide strict/sloppy frames below it.
    const getExternal = new Function("const error = new Error('host CallSite source probe'); void error.stack;");
    new Function('getExternal', 'module', code)(getExternal, module);
    return {value: module.exports, frames};
  } finally {
    Error.prepareStackTrace = previous;
  }
}

const modes = /** @type {const} */ (['coo', 'sco', 'sno']);

for (const mode of modes) {
  for (const strict of [false, true]) {
    test(mode + ' V8 CallSite exposes strict-frame coordinates while withholding strict function objects (' + strict + ')', () => {
      const source = [
        strict ? "'use strict';" : '',
        'const owner = {longPrivatePropertyName: 17, unrelatedField: 23};',
        'function hidden() { /* strict-callsite-source-marker */ const result = owner.longPrivatePropertyName; getExternal(); return result; }',
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
      assert.ok(!output.code.includes('longPrivatePropertyName'), mode + ': transformed output should not retain the private key spelling');

      const native = runWithCallSiteObserver(source);
      const emitted = runWithCallSiteObserver(String(output.code));
      assert.equal(native.value, 21, mode);
      assert.equal(emitted.value, native.value, mode);
      assert.deepEqual(native.frames.map(frame => frame.name), ['hidden'], mode);
      assert.deepEqual(emitted.frames.map(frame => frame.name), ['hidden'], mode);
      assert.notEqual(native.frames[0].column, null, mode);
      assert.notEqual(emitted.frames[0].column, null, mode);
      assert.notEqual(native.frames[0].column, emitted.frames[0].column, mode);

      if (strict) {
        // Strict frames expose names/coordinates but not their function objects.
        assert.equal(native.frames[0].functionType, 'undefined', mode);
        assert.equal(native.frames[0].source, null, mode);
        assert.equal(emitted.frames[0].functionType, 'undefined', mode);
        assert.equal(emitted.frames[0].source, null, mode);
      } else {
        // A sloppy frame below a sloppy host callback exposes its function object.
        assert.equal(native.frames[0].functionType, 'function', mode);
        assert.match(native.frames[0].source || '', /owner\.longPrivatePropertyName/, mode);
        assert.notEqual(emitted.frames[0].source, native.frames[0].source, mode);
        assert.doesNotMatch(emitted.frames[0].source || '', /owner\.longPrivatePropertyName/, mode);
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
