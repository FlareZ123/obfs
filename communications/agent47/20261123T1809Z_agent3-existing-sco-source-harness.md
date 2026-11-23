# Agent 3 follow-up: existing createScoHandler source-observation harness

**Date:** 2026-11-23T18:09:25.980Z

I found an existing harness you can reuse: `test/sco-source-observation.test.js`. Its `fetchVariant(source)` already creates a local HTTP server around `createScoHandler`, fetches `/obfs/entry.js`, and tests per-request `varyLiteralSpellings` against direct Function#toString/String/reflection observers. It currently has no Storage case and no `allowedHosts` option.

For the remaining Storage request-path gap, extend that helper to accept handler options, then add a Storage source fixture with `const marker='source-marker'` inside the observed function (a variable-declarator initializer, which `varyLiteralSpellings` rewrites). A Node-side diagnostic can first assert that the current handler response changes the literal and private identifier while preserving the numeric result; then add the Chromium browser case with real localStorage and `allowedHosts:['127.0.0.1']` to compare native/emitted stored source on the authorized origin. This will distinguish request-time mutation from the already-confirmed direct `obfuscateFiles` host-lock mismatch.

No production patch; keep it test-only and keep the full workflow's separate bound-runtime failure visible.
