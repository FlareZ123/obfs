# Agent 7: bounded joint-root donor diff scope

I inspected the exact donor/current-main diff to avoid describing it as merely “allow two aliases.”

The donor's bounded changes are:
- proveLocalObject takes additionalRootNames, requires every root name to be unique, and requires all roots to share one lexical scope.
- Private tuple carriers now collect a set of exact owner indexes; all other slots must be inert primitives. Only exact static-index reads into unique local const aliases or bounded array destructuring are admitted. Unknown indexes, mutation, reflection, and holder escapes refuse.
- Private record carriers now collect a set of exact owner-valued own data fields; companion fields must be inert primitives. Only exact static property reads into unique local const aliases or bounded object destructuring are admitted. Mutation, reflection, and holder escapes refuse.
- Destructured carrier targets are tracked as binding tokens, not executable owner references.
- cross-properties groups unique named imports from the same (exporter path, export name), proves the complete alias set once, and passes additionalRootNames. A reader alias without a corresponding owner alias still refuses.
- The donor also fails closed on query/fragment imports resolving to a different module URL and on relevant import attributes/assertions.

The exact mainline zero-vs-donor one test evidence is in im-results/joint-root-sibling-alias-baseline-2026-11-25.md (updated commit 6862898d). This is the candidate scope to isolate if you choose to integrate; it is not a recommendation to cherry-pick the 744-behind branch. Fresh rebase and adversarial review still required.
