'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {obfuscateFiles} = require('../src');
const {traceStringConstruction} = require('../sims/runtime-decoder-trace');

/**
 * An attacker can instrument an already-obfuscated executable before any of
 * its eager decoder code runs. The original source is never passed to the
 * attacker; it is used solely by the verifier to check successful extraction.
 */
for (const [mode, sourceType, strings] of [
  ['sno', 'commonjs', undefined],
  ['coo', 'script', true],
  ['sco', 'script', true]
]) {
  test(mode + ' executable string decoder leaks dormant literal to runtime hook', () => {
    const literals = [
      'unexecuted-\u03b1-\ud83d\ude00-\ud800-private-text',
      'long-sentinel-' + 'Q'.repeat(1100) + '-end'
    ];
    for (let index = 0; index < 10; index++) {
      const secret = literals[index % literals.length] + '-seed-' + index;
      const original = "'use strict';function dormant(){return " +
        JSON.stringify(secret) + ";}globalThis.__obfsPublicResult=37;";
      const native = traceStringConstruction(original);
      assert.equal(native.publicResult, 37);
      assert.deepEqual(native.fragments, [], 'Dormant string is unused in the native program');
      const options = {
        mode,
        seed: 'held-out-runtime-trace-' + mode + '-' + index,
        properties: false,
        identifiers: false,
        ...(strings === undefined ? {} : {strings})
      };
      /** @type {'script'|'commonjs'} */
      const typedSource = /** @type {'script'|'commonjs'} */ (sourceType);
      const transformed = obfuscateFiles([{
        path: mode === 'sno' ? 'entry.cjs' : 'entry.js',
        sourceType: typedSource,
        code: original
      }], options).files[0];
      assert.equal(typeof transformed.code, 'string');
      const obfuscated = /** @type {string} */ (transformed.code);
      assert.ok(transformed.metrics.literals >= 1, 'Decoder was not emitted');
      assert.ok(!obfuscated.includes(secret), 'Literal remained visible statically');
      const observed = traceStringConstruction(obfuscated);
      assert.equal(observed.publicResult, native.publicResult);
      assert.ok(observed.fragments.join('').includes(secret),
        'Attacker did not recover the plaintext from the decoder calls');
    }
  });
}
