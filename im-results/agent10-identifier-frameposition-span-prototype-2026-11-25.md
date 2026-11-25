# Agent 10: identifier source-span preservation prototype

**Date:** 2026-11-25  
**Status:** intermediate experimental evidence; isolated branch, not integrated into PR #372.

## Question

Can the local identifier-renaming pass preserve the original UTF-16 source spans, so an external host callback that captures a later strict-ESM module frame does not observe a changed line/column, while retaining nonzero identifier-renaming yield?

## Prototype

Branch: `agent10/identifier-span-preserving-prototype-20261125`  
Latest tested head: `77073e2cb64b0ebf0d4635019a8c6ba598cee9a2`  
Base: Agent 9's test-only branch head `70ef3411ee229db820f33a1b6547d3f8079277b6`, which contains Agent 1's property-span experiment plus the FramePosition browser controls.

The experimental `src/identifiers.js` change:

- Computes the minimum UTF-16 source-token width across the declaration and every identifier occurrence that would be rewritten.
- Chooses a valid deterministic identifier spelling no longer than that minimum width (one-character alphabet for one-unit bindings; underscore-prefixed digest spellings for longer names).
- Pads any shorter spelling with trailing spaces to retain the exact original source span at each occurrence.
- Refuses the entire binding when an occurrence requires an expanding shorthand edit, or when it is used as a tagged-template tag where inserted whitespace could change grammar.
- Retains the existing conservative refusal for ambiguous exports, object patterns, dynamic scope and other unresolved cases.

This is an experimental implementation, not a proof that every JavaScript grammar context or host observation is covered.

## Validation receipts

| Workflow | Evidence | Result |
|---|---|---|
| [45550203618](https://github.com/FlareZ123/obfs/actions/runs/45550203618) | Node unit controls for one-character, short and long bindings; shorthand and tagged-template refusal; exact output-length and parse checks | Pass, both OSes |
| [45550316826](https://github.com/FlareZ123/obfs/actions/runs/45550316826) | Identifier-only strict-ESM Chromium probe; one binding renamed; native/generated values and later module-frame coordinates compared | Pass |
| [45549925528](https://github.com/FlareZ123/obfs/actions/runs/45549925528) | Agent 9's property-only, combined property+identifier, and computed-property strict-ESM Chromium cases on this branch | Pass |
| [45550383057](https://github.com/FlareZ123/obfs/actions/runs/45550383057) | String-only Chromium smoke control; transformed literal count and value parity | Pass |
| [45550388529](https://github.com/FlareZ123/obfs/actions/runs/45550388529) | String-only Chromium FramePosition negative control; asserts the later generated module column differs from native | Pass as a negative control |

The combined property+identifier case is important: the earlier source-pinned witness [45547869135](https://github.com/FlareZ123/obfs/actions/runs/45547869135) measured a +16-column shift with `properties=1`, `bindings=1`, and `literals=0`. On the prototype branch, Agent 9's combined browser control now passes with the property and identifier edits both enabled. The two-character marker still does not trigger string encoding, so this receipt does not qualify the string pass.

The string-only controls establish a separate boundary: the string transformation executes and preserves the tested exported value, but the negative-control test passes only because it confirms that the later strict-ESM module-frame column changes. The exact numeric delta was not preserved in the available job metadata.

## Interpretation

For the tested local identifier cases, source-span-preserving renaming is feasible without disabling the rename. The key is to constrain the replacement spelling by the shortest source occurrence, then pad each edited token to its original UTF-16 width. Syntax forms that require expanding edits must be refused unless separately proven safe.

The string pass is not source-position-preserving in the tested long-literal case. If exact FramePosition parity is part of the behavioral contract, it needs its own effect-aware refusal or a different representation; the identifier fix does not solve it.

## Limits and unresolved work

- Evidence is from Node unit/typecheck controls and one real Chromium/V8 strict-ESM fixture. It is not a cross-engine or universal JavaScript theorem.
- This preserves source coordinates, not original source bytes or `Function#toString()` equality. The separate sloppy-CommonJS wrapper-source observation remains a different boundary.
- String encoding, symbol-key rewriting, cross-file property transforms, VM/control-flow lowering, source maps, and all other length-changing passes have not been qualified by this prototype.
- The prototype has not yet completed the full behavioral/adversarial suite or the complete performance/profile checks. No 2.5× budget conclusion follows.
- No production files in PR #372 were changed. PR #372 remains draft/unmerged at its separate head; this branch is a reviewable experiment only.

## Next

1. Run the full `manual-validation.yml` workflow on this branch and compare the exact failure set with the latest source-pinned main baseline.
2. Inspect any behavioral regressions caused by the conservative shorthand/tag refusal and shorter generated identifiers.
3. Measure the complete runtime and profile budgets; do not infer performance from focused tests.
4. Ask Agent 1 to review the isolated patch before any integration decision.
5. Treat string FramePosition as a separate unresolved effect and avoid claiming that the full pipeline is source-position-safe.
