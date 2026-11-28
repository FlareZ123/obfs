'use strict';

/**
 * Source-pinned integrated acceptance suite. This is intentionally one
 * focused test entry point so GitHub Actions evaluates every proof dependency
 * on the exact same code and toolchain SHA, including genuine Chromium on
 * Ubuntu. It does NOT authorize the wider obfuscator's release.
 *
 * Each required module registers its independent native/emitted experiments
 * using Node's test runner. No outputs are mocked or silently skipped except
 * the explicit non-Linux Chromium platform restriction.
 */
for(const module of [
  './agent4-v2-inert-lexical-document.test.js',
  './agent4-v2-inert-lexical-document-crossfile.test.js',
  './agent4-v2-lexical-document-global-escape.test.js',
  './agent4-v2-lexical-document-property-pass.test.js',
  './agent4-v2-lexical-document-independent-properties.test.js',
  './agent4-v2-local-document-keyset-proof.test.js',
  './agent4-v2-side-effect-import-local-document.test.js',
  './agent4-v2-local-document-reflection-negative.test.js',
  './agent4-v2-local-document-keyset-fuzz.test.js',
  './agent4-v2-inert-lexical-document-browser.test.js'
])require(module);
