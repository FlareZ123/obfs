# Agent 1: opt-in local source-span preservation experiment

**Date:** 2026-11-25  
**Classification:** Intermediate engineering experiment; not a security result or production release claim  
**Branch:** `agent1/property-frameposition-span-current-main-20261125`  
**Base at creation:** main `822ad712`  
**Validated head:** `9f02c2aee3e0a61bce658b54239462975909c1fe`

## Question

Can the existing local property and identifier manglers change names without shifting the line/column coordinates of later code observed through `Error.stack`?

The red-first real-Chromium fixture showed that three local property rewrites on one ESM source line moved a later module frame from column 222 to column 144 (a 78-column shift). The output still returned the same value, but an observer could distinguish the rewritten source by its frame coordinate.

## Implementation

Two opt-in flags were added to `ObfuscationOptions` and passed through `src/core.js`:

- `experimentalLocalPropertySpanPreservation`
- `experimentalLocalIdentifierSpanPreservation`

When enabled:

1. The local property pass replaces only property-key/member tokens whose generated spelling fits within the original token span. Shorter replacements are padded with trailing spaces. It declines candidates containing shorthand, destructuring patterns, `in` checks, or any token that cannot fit.
2. The local identifier pass similarly pads eligible binding/reference tokens. It declines bindings whose generated name is longer than any relevant token and declines shorthand occurrences rather than expanding them.
3. Source widths are measured with JavaScript string `.length` and parser offsets, i.e. UTF-16 code units. No newline is introduced by padding.

Both flags default to `false`. The original default mangling path remains unchanged. The generated-name formats remain the existing fixed-width `_p…` and `_v…` forms; consequently, short property names and short identifiers are deliberately left unchanged in span mode. This is a yield tradeoff, not a claim of full-width name generation.

## Reproducible validation

The focused test file is `test/agent1-property-frameposition-span.test.js`. The final pinned run [45635339662](https://github.com/FlareZ123/obfs/actions/runs/45635339662) passed **7/7 tests** on Ubuntu and completed successfully on Windows; all project, external, and paired-budget JSDoc checks passed on both platforms.

The seven tests cover:

1. Real Chromium strict-ESM property-only rewriting with three keys: dot access, computed string access, and a Unicode/emoji key. Native and rewritten modules returned `66`; the later frame stayed at line 1, column 222.
2. Real Chromium strict-ESM identifier-only rewriting of one long private binding. Native and rewritten modules returned `21`; the later frame stayed at line 1, column 111.
3. Real Chromium strict-ESM combined local identifier and property rewriting, asserting unchanged total source width, equal runtime values, and equal later frame coordinates.
4. Strict CommonJS `Module._compile` property rewriting, asserting the wrapper frame stayed at line 1, column 97 and the module still returned `21`.
5. Property-span mode invariance across COO, SCO, and SNO; property-only output width stays constant, while the default mode retains its existing non-span-preserving output.
6. Identifier-span mode invariance across COO, SCO, and SNO, including a short-name control that is skipped in span mode but remains eligible in default mode.
7. Property-span refusal controls for short keys, shorthand, destructuring, and `in` checks.

Earlier pinned run [45635007188](https://github.com/FlareZ123/obfs/actions/runs/45635007188) passed the initial 6/6 property/identifier/CJS span tests and all JSDoc checks. The combined browser witness was then added, producing the final 7/7 run above.

The independent default-path source-observer control [45632740802](https://github.com/FlareZ123/obfs/actions/runs/45632740802) also passed. The local span flags are opt-in, so this experiment does not change default mangling behavior.

## Limits and unresolved work

This is **not** a general source-position-preserving compiler mode:

- It covers local property and local identifier edits only.
- It does not preserve offsets when string transformations or other source-expanding transforms are enabled.
- It does not cover cross-file property edits; the test fixtures set `closedWorld:false`.
- It does not preserve exact source text. `Function.prototype.toString` still exposes transformed code, which is a separate compatibility/security boundary.
- It does not rename function declaration names; the identifier mangler continues to exclude those names to avoid changing observable function-name/hoisting behavior without a separate proof.
- Short names may remain untouched because the existing fixed-width generated identifiers do not fit their source spans.
- No performance overhead or obfuscation-strength improvement was measured.

The current main cross-file baseline remains independently unresolved: [45632756220](https://github.com/FlareZ123/obfs/actions/runs/45632756220) on main failed the existing `test/interfile.test.js` expectation (expected one cross-file object/two properties, observed zero). This local-only experiment neither fixes nor masks that gap.

The experiment remains separate from PR #372. It does not resolve the PR's CommonJS wrapper-source or exact-source blockers and does not change the release decision. Agent 3 and Agent 9 were asked to review the option boundaries and token-context safety.

— Agent 1


## Later unvalidated string-span prototype (not part of the 7/7 result)

After the validated property/identifier work above, the same research branch gained an experimental `experimentalLocalStringSpanPreservation` option. It appends a lazy decoder after the original module/CommonJS source and pads replaced literal callsites. This is **not** included in the 7/7 evidence above.

The final focused run [45640712863](https://github.com/FlareZ123/obfs/actions/runs/45640712863) failed 1/9 tests on both operating systems. The all-three-mode prefix-offset controls passed, but the real Chromium value witness did not complete: its error-reporting payload hit a Unicode `btoa` failure. The run does not establish whether the generated module or only the error-serialization path caused the underlying browser failure. The lazy decoder also has an unresolved timing difference: it calls `String.fromCharCode` at first literal use rather than at module initialization, so a post-load mutation before first use could change behavior. Keep this prototype out of established findings and do not promote it without repairing the browser harness and testing intrinsic mutation.
