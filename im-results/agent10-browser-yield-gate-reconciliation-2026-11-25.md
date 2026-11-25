# Agent 10: reconciliation of stale browser positive-yield expectations

**Date:** 2026-11-25  
**Test-only branch:** `agent10/sco-host-lock-storage-browser-20261125`  
**Disposition:** current red browser assertions are stale against the source-preservation contract; proposed fixture/test updates are under isolated validation. No production source changed.

## Bound-function interception browser gate

The original `test/bound-runtime-interception-browser.js` was introduced on 2026-11-22 (commit `817e010`) and passed in real Chromium with `protectedKeys:2`, `capturedFunctions:1` (run [44999347098](https://github.com/FlareZ123/obfs/actions/runs/44999347098)). That positive-yield expectation predates the later property-source preservation work:

- `9d793f3f83` (2026-11-23): preserve exported callable source during property renaming; a function binding is private only when unique, not exported, and every non-declaration reference is a direct call within its lexical scope.
- `46be5be605` (2026-11-23): close private callable caller and self-source escape routes.

In the browser fixture, `internal` is used as `internal.bind(null)` and its bound result is exported as `hot`. It is not a direct-call-only private function. Current main-derived output returns `metrics.properties:0`, so the old hard-coded assertion `assert.equal(metrics.properties,2)` fails at line 52 before the browser interception assertions run. This is a safe refusal under the current proof boundary, not evidence that Chromium interception itself failed.

On the isolated test branch, the test now accepts only 0 (fail-closed/source-preserving) or 2 (complete owner rename), rejects partial 1, disables identifier rewriting to isolate property changes, and branches captured-source assertions accordingly. In manual-browser run [45568340627](https://github.com/FlareZ123/obfs/actions/runs/45568340627), step 33 passed and emitted:

```json
{"browser":"Chromium","protectedKeys":0,"rewriteStatus":"refused-to-preserve-source","capturedFunctions":1,"sourceChanged":false}
```

This keeps the hostile bind interception witness while reporting zero obfuscation yield honestly. It does not claim the bound/exported shape is obfuscated.

## Imported constant-key browser cycle fixture

The same manual-browser run then failed at step 40, `test/imported-constant-key-browser.js:187`:

```
AssertionError [ERR_ASSERTION]: named-owner-cycle-earlier
0 !== 1
```

This is another compile-time positive-yield assertion, not a native/emitted runtime mismatch. The fixture's exported `probe` directly contains `bag[key]`, so current source-preservation logic correctly declines to rewrite its body. The source-preservation commit `9d793f3f83` already changed the corresponding unit-level positive cycle fixtures in `test/imported-constant-computed-key.test.js` to use a non-exported direct-call-only `privateProbe()` and a source-stable exported `probe()`; the browser fixture had not been updated.

The test-only branch now mirrors that unit-level correction for the two positive cycle fixtures (`named-owner-cycle-earlier` and `esm-cycle-safe`). The true TDZ and conservative cycle-refusal fixtures remain unchanged. This is a fixture alignment, not a compiler change.

## Current validation

- Manual-browser [45568340627](https://github.com/FlareZ123/obfs/actions/runs/45568340627): bound-runtime step 33 passed with explicit zero-yield report; imported-key step 40 failed on the stale exported-probe fixture; final DOM source-observer JSDoc step 52 passed.
- The corrected cycle fixtures are on test-only branch head `8f0c1f3dd552dd308214f245b3f7ce53b536e376`; manual-browser rerun [45568889102](https://github.com/FlareZ123/obfs/actions/runs/45568889102) is queued at the time of this report.

Agent 29 and Agent 1 have been notified in `communications/agent29/` and `communications/agent1/`. Do not merge these test-only changes without the owners' review. The correct long-term policy is to measure yield separately from semantic safety: exported/source-observable callables should remain source-stable, while private direct-call-only helpers can carry renamed property reads. The overall release status remains **RELEASE-BLOCKED**.


## Final test-branch browser run

The complete manual-browser workflow [45568889102](https://github.com/FlareZ123/obfs/actions/runs/45568889102) completed **SUCCESS** on exact test-only branch head `8f0c1f3dd552dd308214f245b3f7ce53b536e376`. Step 33 (bound-runtime diagnostic) passed with the explicit zero-yield status; step 40 (imported constant-key browser) passed after aligning the two positive cyclic fixtures with the existing `privateProbe()`/exported-wrapper source-preservation contract; steps 43 and 44 passed; step 52 strict DOM source-observer JSDoc passed. Both added Storage browser steps also passed. This green run validates the test harness and fixture alignment only. It does **not** resolve the native-bind dynamic-obfuscation yield question: the bound target remains untransformed (`protectedKeys:0`). The main branch was not modified; all test/workflow changes remain on the isolated Agent 10 branch.
