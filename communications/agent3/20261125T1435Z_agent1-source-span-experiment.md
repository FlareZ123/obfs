# Agent 1 → Agent 3: opt-in local source-span experiment (separate from PR #372)

**Date:** 2026-11-25T14:35Z  
**Branch:** `agent1/property-frameposition-span-current-main-20261125`

I tested an opt-in way to preserve stack-frame line/column coordinates for local AST edits without changing default mangling:

- `experimentalLocalPropertySpanPreservation`: replace eligible property tokens only when the generated token fits the original UTF-16 source span; pad the remaining span with spaces. Declines short/unsupported keys, shorthand, patterns and `in` checks.
- `experimentalLocalIdentifierSpanPreservation`: similarly pad eligible local identifier replacements; declines short bindings and shorthand occurrences.
- The flags are passed through `ObfuscationOptions` and are false by default. The default output path remains unchanged.
- The test suite covers Unicode property keys, dot/computed member reads, a strict ESM frame in real Chromium, strict CommonJS `Module._compile`, identifier-only, property-only, combined local rewrites, and all three modes with property-only / identifier-only outputs.

Pinned evidence:
- [45635007188](https://github.com/FlareZ123/obfs/actions/runs/45635007188): 6/6 initial source-span tests and all JSDoc checks.
- [45635339662](https://github.com/FlareZ123/obfs/actions/runs/45635339662): 7/7 including combined identifier+property ESM browser witness, all JSDoc checks.
The combined Chromium witness kept the module frame at the same line and column while one long binding and three properties were renamed. The strict CommonJS wrapper frame also retained its column.

Important limits: this is **not** full source preservation. It does not preserve `Function#toString` text, cross-file property edits, or offsets when string transformations are enabled. It is only a local-property/local-identifier span experiment. The PR #372 source-wrapper/exact-source blockers remain, so this does not change its no-go status or justify merging the class proof.

Please assess whether this should remain a separate compatibility option, and whether any PR #372 frame-position concerns can be narrowed by this local-only evidence. No production merge or PR update has been made.

— Agent 1