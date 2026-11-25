# Agent 7: self-import and cyclic ESM property-proof audit

**Date:** 2026-11-25  
**Scope:** Test-only audit of the joint-root donor implementation; no production compiler change.

## Source and branch pins

- Donor source branch: `agent7/shared-reference-property-proof-20261124`, implementation commit `1c6127a2d1cb7126286e6f02b1399e499f361dd7`.
- Test-only branch: `agent7/shared-reference-cycle-audit-20261125`; cycle-fixture test pin `dec5fd63a6ce55c09ce7218b4dad03cff3701b87`, direct-API negative-control test pin `1c1d98d01bc75352385c16cd5d60ef54336e8d52`, report commit `f3d4d6597b76ce2aa1919df5f96a0b80ea1cda0d`.
- At comparison time, current `main` was `618520c5b9fe1b2c7ef0e092be6800f0aca0aead`; the donor was 26 commits ahead and 744 behind. The compared differences are limited to `src/cross-properties.js`, `src/properties.js`, and `test/cross-file-reader-flow.test.js`.
- The test branch leaves donor production sources unchanged: `src/cross-properties.js` SHA `3930556874e070f7f13cd7c07e23ff195441cc42`; `src/properties.js` SHA `85beb98ae2031b6b7ce8d76bd84b66aa78936edf`. The audit adds `test/cross-file-reader-flow.test.js`, `test/direct-api-symlink-module-identity.test.js`, and this report.

## Validation

- Focused `manual-validation.yml` run [45566449963](https://github.com/FlareZ123/obfs/actions/runs/45566449963), exact source `dec5fd63a6ce55c09ce7218b4dad03cff3701b87`: Ubuntu and Windows both passed **75/75** tests in `test/cross-file-reader-flow.test.js`, strict project JSDoc, strict external JSDoc, and paired/complete-suite budget JSDoc. The full `node22` job was skipped by the workflow's focused-test mode. This is focused compatibility evidence, not comprehensive release acceptance.
- Reused `manual-cross-readers.yml` run [45566151121](https://github.com/FlareZ123/obfs/actions/runs/45566151121), source `fec84595c795a2950dcad8fb7e7eb8a6ce41a6ab): the cross-file differential/negative-case step passed **449/449** tests on both Ubuntu and Windows. The overall workflow later failed at the separate `examples/closed-graph-host/build-sample.cjs` step: expected `{objects:1,properties:2}`, actual `{objects:0,properties:0}`. This is the existing stale host-lock sample mismatch also reproduced on main in run [45506453994](https://github.com/FlareZ123/obfs/actions/runs/45506453994); it is not a failure of the cross-file reader step or these cycle fixtures.
- Native Node 22 fixture checks independently confirmed the expected outputs before the compiler differential: self-import carrier `46`; self-import TDZ `[true,23]`; reentrant cycle `tdz 23`; late-key cycle `tdz 23`; owner re-export cycle `23`.

## Exact transformation dispositions

Seven fixtures were added to the existing `test/cross-file-reader-flow.test.js` helper. Each compares native Node execution with emitted ESM output; the expected property-rewrite count is pinned.

| Case | Native behavior | Rewrite count | Disposition |
| --- | --- | ---: | --- |
| Self-imports `state as self` and `peek as inspect`, then calls `inspect(self)` | `46` | 0 | Conservative refusal |
| Two self-imported owner aliases stored in separate private carrier slots and consumed by imported/local readers | `46` | 0 | Conservative refusal |
| Self-import reads `self.secretField` before and after the local owner initializer | `[true,23]` | 1 | Positive field rename; early `ReferenceError` preserved |
| A imports B's reader; B reads A's owner through that reader during reentrant evaluation | `tdz 23` | 0 | Conservative refusal; parity preserved |
| A initializes the owner, calls B, then initializes the imported key; B reads `state[key]` | `tdz 23` | 0 | Conservative refusal; late key is not folded across TDZ |
| B reexports A's owner and reader while A imports through B | `23` | 0 | Conservative refusal of owner re-export cycle |
| A imports B's attempt result; B imports A's owner and reader and calls `peek(state)` during evaluation | `tdz 23` | 0 | Conservative refusal; parity preserved |

The self-import reader-alias and two-module reentrant cases were first probed with a positive-yield expectation. The implementation returned zero edits, not a runtime mismatch. Their final tests now explicitly pin zero edits and verify native/emitted output equality. The self-import TDZ case returned one edit; its native/emitted output equality passed, demonstrating that the member-key rewrite does not eliminate evaluation of the imported binding that throws before initialization.

The late-key case specifically exercises the cyclic-graph boundary: a key exported after the owner initializer must not be folded into a literal when an earlier reentrant call can observe its TDZ. The owner re-export cycle remains intentionally outside the supported proof.

## Module-identity boundary

The CLI's `readSourceTree` rejects input symlinks, and output preflight rejects symlink/junction ancestors. This closes the ordinary CLI alias path.

The direct `obfuscateFiles` API accepts caller-constructed `SourceFile` entries. The inspected `resolveImport` in `src/cross-properties.js` normalizes lexical relative paths; it does not establish filesystem realpath/module identity. No concrete runtime mismatch was constructed in this audit. Treat this as an unresolved API precondition, not a demonstrated exploit: direct `closedWorld` callers should supply one canonical path per runtime ESM module and preserve the same module-identity mapping when emitting/deploying files. A future integration should either document this contract or add explicit canonical-identity metadata/validation.

## Integration disposition

This branch is **test-only evidence**, not a current-main candidate. Current main still lacks the donor's joint-root additions (`additionalRootNames` is absent from its property proof), while the donor is 744 commits behind and predates later mainline source-observer/class-source changes. Do not cherry-pick the donor wholesale or open a parallel PR. Any future integration requires an explicit owner decision, a fresh current-main rebase, real Chromium parity for sibling aliases/carriers, focused exact-head validation, and the existing unfocused full `manual-validation.yml` gate.

The product release decision remains **RELEASE-BLOCKED**. These tests establish bounded semantic behavior/refusals only; they do not demonstrate additional static-deobfuscation resistance, tamper resistance, environment locking, or compliance with the 2.5× compute ceiling.


## Additional direct-API symlink module-identity negative control

A separate test file, test/direct-api-symlink-module-identity.test.js, was added at commit 1c1d98d01bc75352385c16cd5d60ef54336e8d52. Focused manual-validation run [45567293260](https://github.com/FlareZ123/obfs/actions/runs/45567293260) passed on Ubuntu and Windows, including strict project, external, and paired-budget JSDoc.

The test supplies two identical ESM SourceFile entries at lib/state.mjs and app/alias.mjs, plus a main module that imports and reads the same exported object's field through both paths. The test runs two deployment layouts:

1. **Two independent regular files:** native output is 23 23 and transformed output remains 23 23.
2. **app/alias.mjs preserved as a symlink to lib/state.mjs:** native Node output is 23 23, while the transformed output is 23 undefined. The compiler reports two property rewrites. Both Linux and Windows runners reproduce the result.

This is a concrete direct-API module-identity compatibility counterexample, not merely an unverified precondition. The API's cross-file mapping includes the lexical exporter path (SHA-256 input is seed/exporterName/exportName/propertyName), while relative imports are resolved lexically. Node's default ESM loader realpaths the symlink and therefore loads one module record. The analyzer has proved two owners; runtime has one.

The normal CLI is protected from this particular input shape: src/cli.js readSourceTree rejects any symlink in the input tree. The issue is limited to callers that manually construct obfuscateFiles source arrays and later emit/deploy multiple lexical aliases as one symlinked runtime module. This does not show an arbitrary attack against the CLI or a hostile filesystem escape.

**Required disposition:** make the direct API contract explicit and/or add caller-supplied canonical module identity metadata. Do not silently call realpath inside the synchronous in-memory API: paths can be virtual and the compiler cannot infer how a caller will deploy them. A caller using closedWorld must provide one canonical path per runtime ESM module and emit the graph with the same module-identity mapping. If this precondition is not acceptable, the API needs an explicit identity/alias model and proof grouping by that identity. The CLI's symlink rejection remains a positive guard.

The donor is still 744 commits behind current main. This negative control was run on the donor implementation; current main's core API also uses lexical safePath/registerFilePath and lexical relative-import resolution, so a current-main focused reproduction is warranted before changing the public API contract. No production code was changed in this audit.
