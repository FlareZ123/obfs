# Decoder descriptor alias-DAG traversal: bounded compile-time improvement (intermediate, 22 November 2026)

## Scope and status

This is a **compiler-side analysis-cost** investigation on a draft stacked branch, not a release-security result. It studies PR #239's `mutatesDecoderIntrinsic` source analysis in `src/core.js`, specifically `descriptorHasSensitiveGetter` and `objectCreateMayExposeDecoderIdentifier`. The existing algorithm removes identifiers from the recursion-path `visited` set on return. A source-visible alias diamond can therefore be explored repeatedly along different paths. The proposed change retains visited identifiers for one entire root query; every independently initiated query still receives its own fresh set.

The test-only branch source is `1f954b465cc716fc751e3704d8f2e70098426b0a` (before), and candidate code/test source is `dbb3f192fa68438f759057b42415355bb1012bcb` (after). Both branch from the draft PR #239 code at `0672b0c5e7f8ce7cea7a506b549d3800b7e72162`. The source changes are two local `visited.delete` removals with comments. Neither alters emitted runtime instructions directly.

## Correctness argument

At each root invocation the analyzer asks whether a reachable identifier, descriptor initializer, member write, `Object.assign` input, reverse alias, or nested object property contains a decoder-sensitive getter. Its dependency and alias maps are completely populated before these root queries and are read-only during the traversal. The nested syntactic expression grammar does not alter these maps. Thus sensitivity is existential graph reachability: every reachable node need only be visited once. A permanent visited set **within one query** explores each node's outgoing edges once. A revisited node cannot expose a newly created edge, and a positive result short-circuits the whole root query. The visited state is never shared between independent calls.

An independent Node.js 22 CommonJS graph model compared path-local DFS, query-global DFS, and an iterative BFS reference for **10,000 reproducibly seeded directed graphs with cycles**, with 1–20 nodes, at most four randomized outgoing edge attempts per node, randomized sensitivity, and randomized roots. All three agreed on reachability. This is supporting computational evidence, not a proof of all JavaScript AST semantics.

A separate pure model of a 16-deep two-node-per-level *directed forward diamond* counted **131,071** recursive calls under path-local deletion against **63** under query-local permanent visitation. A source-style bidirectional alias grid is more demanding because `descriptorBindings` and reverse `descriptorAliases` both create edges.

## Compiler source-pinned validation

The new `test/decoder-alias-dag-compile.test.js` constructs two alias identifiers at each level and assignments to both predecessors, ending in `Object.create(null,a0)`. It compares native and emitted CommonJS results at depths 4, 6, 8, 10 and 12, then checks conservative decoder refusal when a deepest alias writes a getter returning `String.prototype`. It prints timing samples without making noisy wall-clock values an automatic success criterion.

| Depth | Bytes | Unmodified Ubuntu compile (ms) | Revised Ubuntu compile (ms) |
|---|---:|---:|---:|
| 4 | 268 | 5.332 | 5.045 |
| 6 | 336 | 11.389 | 4.723 |
| 8 | 404 | 29.006 | 5.447 |
| 10 | 476 | 169.235 | 7.838 |
| 12 | 560 | 1,810.749 | 7.148 |

The single-run depth-12 ratio is **253.32×** compiler-time improvement for this adversarially shaped source on this runner, subject to timing noise and warmup differences. Both versions recorded `literals:0` for this shape; the measured cost is analysis/preflight and does not claim improvements in emitted-code speed. This one sample does not establish a global complexity bound for the entire compiler.

- Unmodified [run 45049074145](https://github.com/FlareZ123/obfs/actions/runs/45049074145), source `1f954b4`: Ubuntu complete success including behavior, strict type checks, performance steps and browser checks; Windows was still in progress when this report was drafted.
- Revised [run 45049206320](https://github.com/FlareZ123/obfs/actions/runs/45049206320), source `dbb3f19`: Ubuntu complete success across the same workflow; Windows was still in progress when this report was drafted.

## Limitations and integration

This is an engineering change to prevent redundant compile-time traversal. It does not improve resistance to static reconstruction, tracing, runtime interception, or source recovery. It is unrelated to the protected program's strict 2.5× runtime budget. A separate path-local traversal in `objectCreateBoundArgumentCount` remains untouched because its maximum-bound-argument semantics require a different proof.

PR #239 is draft and stacked on older PR #217; no mainline integration or current-main full validation follows from the branch passes. Integration should be coordinated with the existing decoder provenance owners and validated on the exact merged source.
