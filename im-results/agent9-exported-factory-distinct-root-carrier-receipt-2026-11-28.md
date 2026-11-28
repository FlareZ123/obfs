# Exported-factory distinct-root carrier receipt (intermediate)

**Agent:** 9  
**Date:** 2026-11-28T19:28:16.325Z  
**Exact research branch:** `agent9/factory-distinct-roots-carrier-20261128`  
**Exact source SHA:** `a3fa2a4c72d829a28d26b9d72c9055462864ebf2`  
**Workflow:** [Manual cross-file property reader proof, run 46181099496](https://github.com/FlareZ123/obfs/actions/runs/46181099496)  
**Status:** Focused research validation green; **not** current-main integration or release acceptance.

## New positive coverage

The test added at the exact source SHA is `factory results retain ownership through multi-slot records and tuples` in `test/cross-file-identity-return.test.js`. It creates two distinct results from the same exported zero-argument factory, carries them in two different object-record slots and two different tuple slots, captures each slot into a local const alias, forwards one through a separately imported pure identity function, and reads both objects' fields.

For each of COO, SNO and SCO, both carrier forms require:
- exactly two cross-file property rewrites;
- one proven object;
- no surviving `secretField` / `otherField` spellings in the producer or importer;
- exact Node native-versus-emitted output parity.

This is stronger than the earlier test that repeated the same root in both slots. It does not widen the proof grammar: direct slot reads, arbitrary carrier escape, dynamic slots, and unproved factory/import paths remain outside the accepted shape.

## Exact workflow evidence

Both matrix jobs completed successfully at the same SHA:

| Step | Ubuntu / Node 22.23.5 | Windows / Node 22.23.5 |
|---|---:|---:|
| Cross-file differential + negative suite | 456 passed, 0 failed | 456 passed, 0 failed |
| Host-lock and obfuscator suite | 38 passed, 0 failed | 38 passed, 0 failed |
| SCO variant normalization | 4 passed, 0 failed | 4 passed, 0 failed |
| Strict external JSDoc | passed | passed |
| Strict project JSDoc | passed | passed |
| Real Chromium host-lock checks | passed | skipped by workflow condition |

The new positive test is inside the 456-test cross-file suite; its COO/SNO/SCO loops and both carrier shapes therefore passed on both operating systems.

## Separate negative security evidence in the same workflow

The workflow intentionally reproduces the public-only guard-removal attack. Both OS logs report:

`{"removedGuards":3,"unauthorizedHost":"attacker.example","publishedOnly":true,"stillRunnable":true,"events":["state","logic","entry"],"answer":24}`

This is a successful local-guard bypass, not a failure of the cross-file property tests. It means this workflow does **not** establish that a client-side host lock is tamper-resistant. The Chromium host-lock check proves the unmodified sample's permitted/blocked-origin behavior, not resistance to an attacker editing published guards.

The accompanying CPU profile is for the separate closed-graph host-lock sample, not the exported-factory property transform or a full application. It is not a 2.5x compute receipt for the primary objective.

## Integration boundary

A fresh comparison after this test commit reports this branch as **61 commits ahead / 742 behind** current `main` (main head `c1f120c3e781822e62ea53cd956100b4751589e0`; merge base `f775546ec329272b87564a8f826cb4f817e4b590`). The research branch contains 80+ inherited file changes. It is not an acceptable integration base and must not be merged wholesale. The exported-factory block in `src/cross-properties.js` and its multi-root private carrier dependencies in `src/properties.js` require isolated review and a fresh current-main port by the integration owner.

## What this does not establish

- No full current-main-based candidate has been tested.
- No SCO server-side confidentiality/authentication advantage is shown.
- No SNO owner-controlled integrity guarantee is shown.
- No static/dynamic attacker-cost advantage over equal-trust minification is shown.
- No universal 2.5x compute bound is shown.
- This is not a release GO; the repository's acceptance state remains NO-GO / RELEASE-BLOCKED until the unified, exact-SHA acceptance contract passes.

— Agent 9
