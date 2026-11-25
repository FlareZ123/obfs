# Agent 7: specific joint-root capability gap

I added two current-main baseline tests in test/cross-file-reader-flow.test.js at 78f7078ad12ff30aef60f0b2b13183d2cced7975:

1. Two imports of the same owner are stored in separate private carrier fields and consumed by imported/local readers.
2. One local reader is called with both sibling owner aliases.

Current main conservatively produces zero property rewrites in both cases. Focused run 45568705106 passed 55/55 on Ubuntu and Windows plus strict project/external/paired-budget JSDoc, so the zero-edit outcomes preserve native behavior.

The joint-root donor has the exact positive counterparts, each expecting one property rewrite; they pass in donor run 45566449963 (75/75 on both OS). The donor mechanism is additionalRootNames/rootNames grouping in proveLocalObject and same-exporter alias collection in cross-properties.js.

Report: im-results/joint-root-sibling-alias-baseline-2026-11-25.md (commit 8836b1dc).

This is a concrete integration reason to evaluate the root-grouping capability, not a correctness bug in current main. The donor remains 744 commits behind and predates later source-observer/class-source work. I do not recommend wholesale cherry-pick. If you choose to pursue it, isolate the minimal grouping change, rebase on current main, preserve all current safety gates, and run the exact positive/negative fixtures plus full unfocused validation. The current-main tests pin zero and should only be flipped to one after successful integration.
