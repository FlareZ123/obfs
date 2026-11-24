# Hostile Chromium FramePosition parity control (24 November 2026)

**Status:** focused, branch-local compatibility evidence only. Not a production change, general browser guarantee, security result, or release acceptance.

## Provenance

- Candidate base: Agent 3 branch `agent3/frozen-main-rebase-20261124` at `d56cc8c1fc07a61aa6cfad0852b2ac681e30cd7c`.
- Test-only branch: `agent4/frameposition-browser-hostile-review-20261124`.
- Test commit: `bbe394d46a009419b5d683abf3b6bee3826ee9c2`.
- Test file: `test/source-observation-plan-producer-browser.js` (blob `91f8f687077eae268f1c94908fc3ecbc5f06398a`).
- Workflow: [45444329583](https://github.com/FlareZ123/obfs/actions/runs/45444329583), manual-browser.yml with source_observer_plan_only=true; job source-observer-plan completed successfully on ubuntu-latest / Chrome 157.0.8103.78.

## Test construction

The test-only change adds a separate native/emitted page pair. Before importing either ESM module, a classic page script replaces Function.prototype.toString. The replacement reads Error.stack, selects the active /entry.mjs frame, and appends its line/column to the native function source returned by the original intrinsic.

The source is the candidate's direct-reader fixture with a same-line astral comment before Function.prototype.toString.call(observed), and CRLF line endings. The compiler is invoked in COO mode with a separate test host-contract description that explicitly says the page replaces Function.prototype.toString before module evaluation and that effective dispatch is unverified.

Assertions require:

- native and emitted exported values to match;
- native and emitted observed function source plus hostile stack callsite to match exactly;
- the captured callsite to equal line 4 and the 1-based UTF-16 column of the `call` property token;
- at least one property rewrite and one binding rewrite to remain active;
- zero literal rewrites, because the decoder prologue would shift the observed FramePosition.

## Result and interpretation

Run 45444329583 passed. This independently extends the tested FramePosition anchor to Chrome V8 for the exact admitted direct-reader syntax. The test confirms that the `call` member token start is the browser stack callsite for this case and that the candidate's per-pass FramePosition guard preserves parity while declining the frame-shifting decoder.

A local Node v22.16.0 reproduction of the same stack shape also reported the caller frame at the 1-based `call` property token column. A leading-BOM data-module check showed V8 omits the BOM from the reported column while the helper counts it; when the BOM is preserved, this is a constant offset and the equality check remains conservative.

## Limits

- One Chrome/V8 release only; no Firefox, Safari, other browser engines, or other V8 releases were tested by this experiment.
- Only the exact direct Function.prototype.toString.call(identifier) reader accepted by the current producer is covered; aliases, .apply, bind, nested readers and other call forms remain rejected or untested.
- Source-map remapping, altered Error.stack/prepareStackTrace semantics, and hostile replacement of other intrinsics are not covered.
- This validates the narrow validator guard, not a trusted runtime. A client-controlled realm can still replace Error, stack formatting, Function.prototype.call, or the module loader.
- The candidate graph still lacks an explicit FramePosition observation-effect bit and corresponding ActiveFrameEdge; this test does not close that schema gap.
- No full suite, cross-mode acceptance, SCO/SNO/browser hostile matrix, hot-function/session CPU qualification, or tamper-resistance proof is implied.

**Decision:** retain as intermediate evidence; do not promote to results/ or remove RELEASE-BLOCKED / NO-GO.