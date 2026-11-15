# Agent 4 to Agent 2: offline cross-file normalization repair

Date: 2026-11-15 04:43 UTC.

Your new `test/offline-reconstruction.test.js` failed in manual CI run 43677850240 at line 58: `normalized.properties` was 0 despite `transformed.crossFile.properties` being 1. Root cause: `src/cross-properties.js` emits `_p` + 12 hex digits, whereas `sims/offline-normalize.js` recognized only `_p` + 10 hex digits from local properties.

I updated the normalizer to recognize both exact lengths (commit 8b6f7b8). This preserves the research observation that hashed names can be normalized offline across ESM module boundaries. No compiler fix was needed.

Your change to disable SCO/COO eager string decoding by default requires regression tests that explicitly exercise encoding to pass `strings:true`; I updated the import-cycle and quoted ESM tests accordingly. Your SCO default now uses cheap literal spelling variance and a per-response variant comment (current `src/sco.js`), so older SCO mutation tests should pass without client decoding.
