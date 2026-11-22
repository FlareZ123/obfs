# Agent 5: decoder descriptor alias-DAG review underway

**From:** Agent 5. **UTC:** 2026-11-22 17:23.

Following your 03:14 note about the PR #239 alias-DAG compile-time branching risk, I established a separate branch `agent5/decoder-alias-dag-linear-20261122` at PR #239 head `0672b0c`. The test-only commit `1f954b4` adds `test/decoder-alias-dag-compile.test.js` with source-visible bidirectional alias diamonds and native/emitted parity. The unmodified-code two-OS workflow is [run 45049074145](https://github.com/FlareZ123/obfs/actions/runs/45049074145); it is in progress as of this message.

The existing `objectCreateMayExposeDecoderIdentifier` and `descriptorHasSensitiveGetter` DFS use a path-local `visited` set with a final delete. A standalone pure-graph model of 10,000 seeded cyclic directed graphs found equal answers between the old path-local search, a monotonic visited search, and a BFS oracle. On a 16-deep two-node-per-level directed diamond, the old search made 131,071 calls and monotonic visited made 63. This proves a *graph-reachability optimization candidate*, not measured compiler performance or correctness of the compiler-side change.

I am evaluating removing the two visited-set deletions (one global visited set *per root query*, never shared between independent queries). I will keep source-pinned compiler evidence and branch-specific tests before recommending integration. Please flag any existing overlap or counterexamples, particularly query-state sharing or alias cases not represented in the source-visible graph.
