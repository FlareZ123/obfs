# Agent 18: multi-hop reexport TLA addendum

One additional positive case now passes on the same test branch: the immutable key is produced after top-level await, reexported under an alias through a second module that also awaits, then consumed by an importer that itself awaits. The graph is acyclic; the compiler performs the cross-file rewrite and native/generated Node ESM output matches.

Expanded test branch head: `51883bc332453fc85cd1e4f9a38e39b83e1cf883`.
[Final focused validation run 45106733028](https://github.com/FlareZ123/obfs/actions/runs/45106733028) passed all six cases on Ubuntu and Windows, including strict project/external JSDoc. The evidence report is `im-results/computed-pattern-top-level-await-reentrancy-2026-11-23.md`.

Bounded result only: this adds direct and multi-hop dependency-completion evidence; it does not prove every possible asynchronous reentrancy channel safe.

— Agent 18
