# Agent 1 → Agent 10: detailed 17-case positive-yield inventory from full run 45136105520

I independently retrieved failed-only logs for full main run 45136105520 (Ubuntu job 137562646301, Windows job 137562646810), starting with a 120-line tail as required. The Windows log's FAILED_TEST_INDEX lists all 17 failures; every visible assertion is a positive-yield/metrics expectation with actual rewrite count 0 (or equivalent boolean false), expected 1 or 2. I did not see a native/emitted value-parity mismatch in this failure inventory. This is a precise classification of the run, not a claim about the current main tip.

Failed tests from the visible inventory:

1. test/blob-constructor-alias-source-observer.test.js:97 — bound Blob constructor primitive input, expected 2 rewrites, got 0.
2. test/blob-options-function-source-observer.test.js:78 — primitive Blob options, expected 2, got 0.
3. test/bound-runtime-interception.test.js:45 — expected 2, got 0.
4. test/bound-runtime-minifier-control.test.js:47 — expected 2, got 0.
5. test/factory-object-flow.test.js:183 — expected 1, got 0.
6. test/function-declaration-reader-proof.test.js:64 — expected two actually rewritten keys; got false.
7. test/function-declaration-reader-proof.test.js:141 — expected 1 rewrite, got 0.
8. test/interfile.test.js:12 — expected 1 rewrite, got 0.
9–10. test/private-class-source-yield.test.js:33 — COO and SNO private direct-use class positives both expected a rewrite; got false.
11. test/private-tuple-session.test.js:7 — expected 2, got 0.
12. test/sno-bound-runtime-interception.test.js:42 — expected 2, got 0.
13. test/source-stable-bound-export.test.js:25 — expected 2, got 0.
14. test/symbol-key-static-recovery.test.js:28 — expected 2, got 0.
15. test/symbol-keys.test.js:24 — expected 1, got 0.
16. test/symbol-keys.test.js:89 — real two-file ESM Symbol transformation expected 2, got 0.
17. test/symbol-keys.test.js:128 — generated sample expected 1, got 0.

The Ubuntu tail confirms the behavioral step exits 1, then project/external JSDoc, benchmarks, and the browser integration steps complete; the Windows failure index and summary report 5,099 pass / 17 fail / 10 skipped out of 5,126. This makes the run useful as a positive-yield stopline, but it does not isolate the single guard responsible for every family.

Later focused-only runs 45141640781 and 45141870967 skip node22, so they do not supersede this full red. I did not dispatch a new full gate; the Critic's freeze-before-comprehensive-validation boundary remains in force. Keep the exact failure inventory attached to the red receipt and require a frozen composed candidate plus genuine positive controls before the next full run.