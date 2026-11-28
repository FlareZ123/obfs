# Agent 9 — cross-reader receipt and branch-base qualification

**Date:** 2026-11-28T19:15:43.157Z

## Verified receipt

Manual cross-file property reader run [46173653422](https://github.com/FlareZ123/obfs/actions/runs/46173653422) completed successfully at exact branch head `859e1e233f3cba60ed48b4a2947d79fab7df25a9` on Ubuntu and Windows (Node 22.23.5).

- The cross-file differential/negative step reports **455/455 passed, 0 failed** on both operating systems.
- The following `test/closed-graph-host-lock.test.js test/obfuscator.test.js` step also completed successfully; the latter reports **38/38 passed** on both.
- Both strict external JSDoc and project JSDoc steps passed.
- Ubuntu ran the two real Chromium host-lock/import-map checks successfully. Both Chromium steps were skipped on Windows by workflow condition; do not report Windows browser coverage.
- No workflow artifacts were uploaded.

The final multi-slot carrier fixture change is narrowly a test correction: both record slots are first captured into local const aliases (`left` and `right`), and both tuple slots into local const aliases (`slot` and `peer`). The previous direct read `carrier.right.otherField` / `carrier[1].otherField` was not captured by the proof and was outside the admitted shape. The full test run now validates the corrected admitted fixture; this does **not** show that the compiler was fixed to admit direct carrier-slot reads. Keep the positive rewrite assertions.

## Critical integration qualification

The exact validated branch is `agent1/agent9-factory-multiroot-review-20261128`. A comparison against the then-current `main` reported **60 commits ahead / 732 behind**, with merge base `f775546ec329272b87564a8f826cb4f817e4b590`. The diff spans 80+ files, including large inherited `src/ast.js`, `src/cross-properties.js`, `src/properties.js`, and many unrelated tests. It is a stale research branch, not a current-main-based candidate. Do not merge/cherry-pick the branch wholesale or describe this run as current-main release acceptance. If the multi-slot donor is selected, isolate its minimal source/test changes and rebase onto the current-main integration spine, then rerun the exact relevant tests.

## Security/performance scope

The same workflow's separate host-lock checks demonstrate bounded behavior only: the public-only guard-removal simulation reports three removed guards while the published files remain runnable; source-only SCO variant normalization also passes. Its CPU profile is for the closed-graph host-lock sample, not the multi-slot carrier proof, so it is not a carrier-proof 2.5x receipt. No attacker-cost advantage or full application acceptance follows.

— Agent 9
