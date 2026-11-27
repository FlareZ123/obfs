# Intermediate result: local identifier yield inside source-observer islands

**Date:** 2026-11-23  
**Owner:** Agent 10  
**Status:** experimental branch; focused two-platform gate green; full validation and adversarial review pending  
**Branch:** `agent10/source-island-identifier-yield-20261123-rebased`  
**Draft PR:** [#361](https://github.com/FlareZ123/obfs/pull/361)

## Motivation

The default multi-file source-observer policy is group-wide: if one file observes callable source, unrelated local identifier rewrites in every file are suppressed. The experimental `experimentalSourceObserverIslands` proof already permits local private-property rewriting in selected closed-world ESM leaves whose exports are only zero-argument functions returning primitive snapshots. It did not permit local identifier rewriting in those leaves.

This experiment asks whether that same narrow island can also rename a local owner binding without changing the exact source of any exported callable.

## Change

- `src/core.js` now permits the ordinary local identifier pass when either no group-wide source observer exists **or** the current file is a member of the explicitly proved source-observer-island set.
- Selected islands call `renameLocalIdentifiers` with `preserveExportedFunctionSource:true`.
- `src/identifiers.js` collects every `Identifier` spelling occurring inside each exported named `FunctionDeclaration` and refuses to rename any candidate with one of those spellings. This deliberately overprotects names when a spelling is also a non-lexical identifier; conservative false positives are acceptable.
- The default group-wide veto remains unchanged for every non-selected file. Cross-file property rewriting, string decoding, VM lowering, Symbol-key lowering, host-lock logic and default options are unchanged.

The intended bounded case is a selected leaf such as:

```js
const recordB={privateB:23,otherB:19};
const valueB=recordB.privateB;
export function unrelated(){return valueB;}
```

The pass can rename `recordB` and the proven private property, while retaining `valueB` because its spelling is part of the exported function's exact source. The function name and arity are not changed.

## Evidence

### Focused Node/JSDoc gate

[Manual validation run 45275014002](https://github.com/FlareZ123/obfs/actions/runs/45275014002) passed on Ubuntu and Windows:

- 9/9 `test/source-observer-islands.test.js` tests passed on both platforms.
- Strict project JSDoc passed on both platforms.
- Strict external JSDoc passed on both platforms.
- Paired/complete-suite runtime-budget JSDoc passed on both platforms.

The new test covers COO, SCO and SNO compiler modes, two seeds, two selected primitive leaves, and an external ESM consumer. It checks that the watched module and observer entry remain unchanged, that each selected leaf gains at least one private-property rewrite and exactly one local-binding rewrite, and that external `Function#toString()` values and primitive outputs remain exact.

Earlier focused runs exposed only test-harness mistakes (over-escaped regular expressions, an external ESM entry filename mismatch, and missing literal JSDoc typing); these were corrected before the green run.

### Real-browser check

`test/browser-integration.js` now includes a COO/Chromium fixture. A sibling module observes the watched function's source and activates the group-wide veto; selected leaves are transformed; a separate external browser module then checks the exact source of all three exported functions and the primitive outputs. The page reports `island-ok` only when those checks pass.

- Full manual validation run [45275517067](https://github.com/FlareZ123/obfs/actions/runs/45275517067) completed on the earlier branch tip `c51f39af332c59faaa2eb13119cfe3699e14ccce`. Both Ubuntu and Windows ran 5,325 tests and reported the same 17 failures; the 17 names are the previously persistent over-refusal/positive-yield cases from the mainline comparison. The nine additional lexical reference-role cases in the older 26-failure receipt did not recur. The source-island test was not among the failures. Ubuntu reported 5,283 passed / 17 failed / 25 skipped; Windows reported 5,276 passed / 17 failed / 32 skipped. This is not full acceptance.
- The new browser fixture in that old commit stopped before launching Chrome because it asserted exactly one rewritten property; the selected leaves actually reported two (`2 !== 1`). This was a brittle test expectation, not a runtime mismatch. The branch tip was corrected to assert `properties >= 1`, and its browser fixture received explicit JSDoc types.
- The same full run's existing Chromium checks `verified-record-browser.js` and `esm-observation-browser.js` passed, but they did not exercise the new source-island fixture because the earlier assertion aborted `test/browser-integration.js`.
- Focused run [45277361888](https://github.com/FlareZ123/obfs/actions/runs/45277361888) passed on Ubuntu and Windows against the rebased branch: all 9 focused source-island tests and all strict JSDoc gates passed.
- A dedicated real-Chromium source-island test now exists on the rebased branch at `test/source-observer-islands-browser.test.js`. Focused run [45277585181](https://github.com/FlareZ123/obfs/actions/runs/45277585181) completed successfully: Ubuntu executed both the dedicated external source/metadata/value probe and the canonical `test/browser-integration.js` harness (including the new island fixture); Windows skipped browser execution as intended and passed strict JSDoc.

Do not infer a browser pass until run 45277031949 completes.

## Interpretation and limitations

This is a **compatibility/yield experiment**, not a new confidentiality or tamper-resistance result. The generated code adds no runtime decoder, helper call, or integrity check, but no dedicated CPU or compilation-time benchmark has yet been run. The 2.5× ceiling is therefore not certified by this experiment.

The proof is deliberately narrow:

- The selection remains opt-in and requires the existing closed-world source-island proof.
- Selected exports remain primitive-returning zero-argument functions; arbitrary function bodies, imported host capabilities, mutable/escaping records and source-observing uses remain outside the admitted grammar.
- Exact exported function source is preserved by pinning identifier spellings in exported function declarations. This does not preserve the entire distributed module's bytes; hiding/rewriting those bytes is the purpose of obfuscation.
- The feature does not prove resistance to static reconstruction, DevTools, runtime extraction, hostile loaders, arbitrary external code, or integrity bypasses.
- It does not implement the general carrier/effect analysis proposed for `ExactSource`, `FramePosition`, `CallableMetadata` and `UnknownHostEffect`. The narrow leaf grammar excludes calls/throws/re-entry in the selected function, but this is not a general dynamic-frame theorem.
- Only the Node focused suite covers all three modes. The real-browser fixture covers COO only. No end-to-end SCO server-resident or SNO deployment test is added here.
- Strong-protection release remains **BLOCKED** pending the canonical current-main full suite, hostile-runtime evaluation, and independent 2.5× performance evidence.

## Next

1. Inspect full run 45275517067 and focused run 45276197251, including failed-job identities and the actual Chromium step.
2. Obtain adversarial review from Agents 1, 3 and 39, especially on source and dynamic-frame observability.
3. Refresh/rebase against current main before a PR; do not merge this experiment without Agent 3's integration review.
4. Keep this record in `im-results/`; it does not meet the established-results standard.
