# WeakMap cross-boundary source-observer falsifiers in real Chromium

**Author:** Agent 4  
**Date:** 26 November 2026  
**Classification:** Intermediate reproducible browser evidence; not an established security result.  
**Candidate source SHA:** `fcec2e0d99e909e43433b18cacb63f9fba37b31e`  
**Browser-test branch:** `agent4/weakmap-browser-source-observer-falsifiers-20261126`  
**Exact browser-test commit:** `c907167a563836775f85615b459751f2c554e2bd`  
**Browser-test file:** `test/agent4-weakmap-browser-source-observer-falsifiers.js`  
**Browser-test blob:** `f4d98648e6371e4710b291b1808265655cb56173`  
**Manual workflow update:** `8d8da6a7243c176ee8f4ddd068a3ec752d4a7712`  
**Workflow documentation update:** `3af358e2cf49e9cfbc6b578446806c0bd31af786`  
**Exact Chromium run:** [45898378264](https://github.com/FlareZ123/obfs/actions/runs/45898378264)

## Executive finding

Three of Agent 7's six Node-reproduced WeakMap cross-boundary source-capture false-safes also reproduce in a real browser. The exact frozen compiler candidate was exercised in Google Chrome 158.0.8127.36. All six client-mode/scenario combinations passed the *expected-vulnerability diagnostic*:

- three browser-applicable scenarios;
- both client modes, COO and SCO;
- six source-capture mismatches in total.

For every combination, the Storage module reported four identifier-binding rewrites, native and emitted application return values were identical, and the emitted `inspect` function source differed from the native source. The native `privateLocal` identifier became a generated identifier in the emitted source.

This confirms that these are not merely Node VM or Document/Storage shim artifacts. The demonstrated browser paths include real classic script elements, real ESM loading, the browser's native WeakMap prototype, actual Storage objects, and the browser's Document.title string conversion. The expanded matrix also preserves the known ESM exported-factory positive control in both client modes.

## Exact candidate and production-source provenance

The browser test commit is test-only relative to the frozen candidate. At the exact browser-test commit:

- `src/ast.js` blob: `b1a14066074b35a731c13bea62a723b58d998fc3`
- `src/core.js` blob: `de1aa462ec7fb5202724b6f3bf0eb9b916dc8d24`

Both blobs match candidate source SHA `fcec2e0d99e909e43433b18cacb63f9fba37b31e`. No production compiler source was changed for this investigation.

The manual workflow remains `workflow_dispatch` only; no push/PR trigger was added. It accepts the exact candidate SHA and an opt-in `weakmap_source_falsifiers` boolean. The input description and README explicitly state that a green diagnostic run means the known vulnerability was reproduced, not that the candidate is secure.

## Browser methodology

The harness is `test/agent4-weakmap-browser-source-observer-falsifiers.js`. It compiles the source group separately for COO and SCO, serves native and emitted resources from a local HTTP server, and opens each page in headless Chromium. The attacker-side mutation is installed before the Storage observer module is evaluated.

The Storage module keeps a private `inspect` function and a private WeakMap. It replaces the browser's `Storage.prototype.setItem` with a wrapper that stores the supplied function in the WeakMap. Before that operation, the mutation path patches native `WeakMap.prototype.set` so that the function value is converted through the real `document.title` DOMString setter. The resulting title is the host-observed function source.

The diagnostic checks, independently for each mode/scenario:

1. Native browser execution captures source containing `privateLocal`.
2. The obfuscator reports four Storage identifier bindings.
3. Emitted application return values equal the native return values.
4. Emitted captured function source differs from native source and no longer contains `privateLocal`.

The browser runner also checks that the browser returns a structured result rather than a page/module-loading error. Strict external JSDoc checking runs after the browser matrix.

## Confirmed browser matrix

Google Chrome 158.0.8127.36; exact candidate/test commit `c907167a563836775f85615b459751f2c554e2bd`; run [45898378264](https://github.com/FlareZ123/obfs/actions/runs/45898378264).

| Browser scenario | COO | SCO |
|---|---:|---:|
| Classic scripts sharing a top-level lexical WeakMap carrier across script elements | Confirmed | Confirmed |
| External consumer of an ESM-exported WeakMap-derived class | Confirmed | Confirmed |
| External consumer of an ESM-exported factory (positive control) | Protected: zero rewrites and exact source parity | Protected: zero rewrites and exact source parity |
| Supplied ESM mutation module calling an unresolved external factory through an import map | Confirmed | Confirmed |

All six combinations reported `storageMetrics.bindings = 4`. In each, the native source was:

```js
function inspect(){const privateLocal=29;return privateLocal;}
```

Emitted examples included:

```js
function inspect(){const _v331966f54d52=29;return _v331966f54d52;}
```

The generated spelling varies by seed/mode. In every combination, the application result remained `{value:29, independent:7}`.

### Scenario details

1. **Classic script realm binding.** The first classic script declares `let carrier = new WeakMap()`. A second classic script reads `Object.getPrototypeOf(carrier)` and patches the shared native prototype. The browser loads the scripts as separate ordered `<script>` elements in one realm, preserving the global lexical binding relationship that per-AST analysis currently misses.

2. **External ESM-derived class.** The supplied producer exports `class Derived extends globalThis.WeakMap {}`. The external browser runner imports it, obtains `Object.getPrototypeOf(Derived.prototype)`, and patches the native parent prototype before importing the entry module. The external runner is not part of the obfuscator input.

3. **Unresolved external ESM factory.** The supplied mutation module imports `make` from bare package `opaque-runtime`. An import map resolves this to a real browser module that exports `make(){ return new WeakMap(); }`, but that producer module is deliberately absent from the obfuscator input. The supplied mutation module calls the unresolved import and patches the returned instance's native prototype before the Storage module initializes.

## Existing positive controls

The same exact run passed the existing manual Chromium controls before running the expected-vulnerability matrix:

- `test/agent4-weakmap-direct-prototype-chromium.js`: direct native WeakMap prototype mutation was refused; zero Storage bindings were rewritten and captured function source was identical.
- `test/agent10-weakmap-prototype-cross-file-browser.js`: the previously covered cross-file subclass-parent prototype mutation was refused; zero Storage bindings were rewritten and captured source was identical.
- The added ESM exported-factory positive control: the external consumer obtains the WeakMap from a supplied exported factory, but the candidate correctly refuses Storage binding rewrites and preserves captured source in both COO and SCO.
- `npm run typecheck:external`: passed for the browser harness and external research tools.

These controls matter: the new findings concern the cross-unit/export/import boundaries above, not the direct prototype cases already guarded by the candidate.

## Relationship to Agent 7's Node evidence

Agent 7's [consolidated cross-boundary report](weakmap-source-observer-cross-boundary-falsifiers-2026-11-26.md) documents six end-to-end false-safes reproduced in COO/SNO/SCO on Ubuntu, Windows, and macOS:

1. classic-script shared lexical carrier;
2. ESM-exported derived class;
3. CommonJS-exported derived class;
4. CommonJS-exported factory;
5. unresolved external ESM imported factory;
6. unresolved external CommonJS require factory.

This Chromium work independently confirms the first, second, and fifth browser-applicable scenarios in both COO and SCO. The CommonJS export/factory cases and SNO server runtime remain Node-side evidence; this report does not claim to have executed them in Chromium.

## Interpretation and limits

The browser receipts confirm a concrete source-observation false-safe: an attacker-side script can mutate the shared native WeakMap prototype, cause the browser's Storage wrapper to capture a function's source, and observe identifier renaming while ordinary application return values remain equal.

The result does **not** establish:
- a fix or production compiler change;
- complete WeakMap analysis or a complete interprocedural/realm graph;
- SNO server-runtime correctness;
- CommonJS behavior in a browser;
- universal browser compatibility beyond the tested Chrome version;
- static deobfuscation resistance, dynamic extraction resistance in general, or environment locking;
- performance compliance with the 2.5× runtime budget;
- an academically established obfuscation-security result.

Keep this work in `im-results/`. The release/security decision remains **RELEASE-BLOCKED / NO-GO** until the six source-level falsifiers, positive-yield controls, exact full gates, runtime-budget measurements, and the broader threat-model requirements are resolved on one frozen candidate.


## Addendum — ESM exported-factory positive control (26 November 2026)

The browser matrix was expanded with the positive control already present in Agent 7's Node suite: an external browser consumer imports `export function make(){return new WeakMap();}`, obtains the returned instance's native prototype, patches it, then imports the Storage observer.

Exact expanded test commit: `c907167a563836775f85615b459751f2c554e2bd` (test blob `f4d98648e6371e4710b291b1808265655cb56173`). Exact run: [45898378264](https://github.com/FlareZ123/obfs/actions/runs/45898378264), Google Chrome 158.0.8127.36.

Results:
- The three false-safe scenarios still reproduce in COO and SCO: **6/6** source-capture mismatches, four Storage bindings rewritten per combination, same application result.
- The exported ESM factory remains protected in COO and SCO: **2/2** positive controls have zero Storage binding rewrites and exact native/emitted captured-source parity.
- The direct-prototype and subclass-parent controls still pass with zero Storage binding rewrites and exact source parity.
- Strict external JSDoc checking passes.

The earlier false-safe-only run 45897924700 is superseded as the latest matrix receipt by 45898378264. The latter exact commit includes all six browser false-safe combinations plus the ESM exported-factory positive control. Production source blobs remain unchanged from candidate fcec2e0.


## Addendum — independent challenge of Agent 10's group-guard donor

Agent 10 requested an independent review of the donor's false-negative surface. I replayed the exact same browser matrix against donor head `0b119c540a903cc786be74f29c2d63e6b6c2e903`, without changing its production source.

- Donor branch: `agent10/weakmap-group-prototype-guard-20261126`
- Donor source blobs: `src/ast.js=87b0ae498f6928ccdb758b37ae14f19e22938bcb`; `src/core.js=cb88e06b726e7d6521db09bd080410dc1c1a49de`
- Test-only challenge branch: `agent4/agent10-group-guard-cross-boundary-challenge-20261126`
- Exact test/challenge commit: `5cc08f008dbf2b330e2ad9ff3bfe02b7580f14fb`
- Test blob: `851949011e022523f12b2d61f949f60a078a7f96`
- Chrome: Google Chrome 157.0.8103.78

### Safe-mode acceptance attempt

Run [45899017565](https://github.com/FlareZ123/obfs/actions/runs/45899017565) used `WEAKMAP_EXPECT_SAFE=1`, requiring zero rewrites and exact source parity for all four scenarios in both client modes.

It failed with **6 unsafe cases**:
- classic cross-unit lexical carrier: COO and SCO;
- externally consumed ESM-derived class: COO and SCO;
- unresolved external ESM factory: COO and SCO.

The ESM exported-factory positive control remained protected in both modes: zero Storage rewrites and exact source parity. Both pre-existing direct-prototype and subclass-parent Chromium controls also passed. The failure is therefore not a broad loss of all WeakMap detection; it is a specific gap in the donor's cross-unit/export/import boundary handling.

### Expected-vulnerability reproduction

Run [45899117584](https://github.com/FlareZ123/obfs/actions/runs/45899117584) used the same exact donor/test commit with `WEAKMAP_EXPECT_SAFE=0`. It passed as an expected-vulnerability diagnostic with six false-safes and two protected ESM exported-factory controls. Strict external JSDoc passed.

### Source-level explanation

The donor's current structure explains these results:

- `src/core.js:2035-2036` computes `sharedWeakMapPrototypeExposure` using `sourceObserverFiles.some(({ast}) => hasWeakMapPrototypeExposure(ast))`. This ORs per-AST results; it does not unify lexical bindings or carrier flow across classic script units.
- `src/ast.js:69` begins the per-AST scanner. Its export-name summary at lines 375-376 marks exported instances, factories, constructors and prototype aliases, but does not include a derived-class constructor set. An exported `class Derived extends globalThis.WeakMap {}` is therefore not treated as the same escape as an exported native WeakMap factory.
- The local function-return summary can recognize a supplied/exported factory such as `export function make(){return new WeakMap();}`. It cannot prove that an unresolved imported `make()` from an external package returns a WeakMap, and the external package is not in the supplied source group.

The donor therefore retains a useful bounded local summary and the exported ESM factory positive control, but its per-AST Boolean is not a cross-file or external-import proof. The browser receipts falsify any claim that the current donor closes the three tested boundary classes. This is an independent test-only challenge; no donor source or branch was modified.

The test branch and reports remain intermediate evidence. Agent 10 and Agent 1 were sent the exact run IDs, source locations, and suggested next boundary checks. Do not promote the donor or change the release decision on the strength of these targeted receipts.


## Addendum — safe-mode red gate on Agent 1's frozen candidate

The safe-mode acceptance path was also run against Agent 1's exact frozen candidate source, using the updated harness that collects all failures instead of stopping at the first mismatch.

- Candidate source SHA: `fcec2e0d99e909e43433b18cacb63f9fba37b31e`
- Test-only candidate branch commit: `30cf06e8bb2e6968a6f4c02eaf1dd4ec1aad8a19`
- Browser: Google Chrome 157.0.8103.78
- Mode: `WEAKMAP_EXPECT_SAFE=1`
- Run: [45899387020](https://github.com/FlareZ123/obfs/actions/runs/45899387020)

The run failed after evaluating the full matrix, reporting all **six** expected false-safe cases (classic cross-unit lexical carrier, external ESM-derived class, unresolved external ESM factory; COO/SCO). The exported ESM factory remained protected in both modes. The direct-prototype and subclass-parent controls passed. This is the intended red acceptance result for the unpatched candidate, not a harness failure.

The same safe-mode harness was challenged against Agent 10's donor above and likewise found six unsafe cases. The expected-vulnerability diagnostic mode on that donor passed run 45899117584 with six false-safes and two protected cases. The manual workflow now supports both modes: default diagnostic reproduction and opt-in `weakmap_expect_safe=true` for a patched candidate's zero-rewrite/source-parity gate.
