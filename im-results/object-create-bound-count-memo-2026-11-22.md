# Acyclic bound-count alias memoization for first-class Object.create

**Status: intermediate compiler-correctness and compile-time study, 22 November 2026.** This contribution is intentionally separate from the query-local descriptor reachability change in [draft PR #289](https://github.com/FlareZ123/obfs/pull/289). It makes no claim about protected-code runtime, attack resistance, universal 2.5× compliance or the mainline release decision.

## Compiler question and proposed change

The draft stacked decoder provenance implementation in `src/core.js` invokes `objectCreateBoundArgumentCount` to identify the descriptor parameter of first-class `Object.create` calls, including bound callables. Unlike Boolean descriptor sensitivity, this function computes **the maximum number of bound leading arguments** over multiple source-visible identifier bindings. Merely retaining a global visited set would discard a legitimate maximum when two aliases reach the same name along different paths.

The existing recurrence takes the maximum over weighted path extensions (a `.bind(thisArg, ...args)` edge adds `args.length`) and returns zero when an identifier already occurs on the active path. This is a maximum-weight finite path computation with path-local cycle cutoff, not ordinary reachability.

The candidate in `agent5/object-create-bound-count-memo-20261122` adds a per-root `Map<string,number>` cache and a `cycleAffected` set. A backedge marks the entire active recursion path context-dependent. An identifier result is memoized only if no such backedge arose during its evaluation. Thus acyclic subgraphs can be shared; cycle-sensitive branches retain the prior path-local semantics. Every root invocation creates fresh memo state, which matters because Object.create holder-field bound counts can change during fixed-point alias discovery.

## Differential and model tests

The source-paired `test/object-create-bound-count-dag-compile.test.js` generates actual JavaScript with alternating bound/unbound first-class Object.create bindings, two aliases per level, and an ordinary string-encoding positive yield. It executes the native and emitted output as CommonJS and profiles the compiler at depths 4, 8, 12, 16, 18 and 20. Both branches use the **same test blob SHA `6b9ae3ccc7a6c254986b5a564e2e8482216417a1`**, avoiding a changing-fixture comparison.

| Depth | Input bytes | Unchanged Ubuntu compiler (ms) | Memoized Ubuntu compiler (ms) |
|---|---:|---:|---:|
| 4 | 276 | 10.127 | 11.514 |
| 8 | 412 | 9.862 | 15.515 |
| 12 | 569 | 26.616 | 23.037 |
| 16 | 737 | 48.156 | 15.992 |
| 18 | 821 | 114.015 | 23.048 |
| 20 | 905 | 404.642 | 21.549 |

| Depth | Input bytes | Unchanged Windows compiler (ms) | Memoized Windows compiler (ms) |
|---|---:|---:|---:|
| 4 | 276 | 7.008 | 14.077 |
| 8 | 412 | 12.011 | 32.663 |
| 12 | 569 | 24.806 | 21.350 |
| 16 | 737 | 47.404 | 20.409 |
| 18 | 821 | 139.415 | 26.352 |
| 20 | 905 | 502.380 | 39.132 |

The depth-20 single-sample improvements are **18.78× on Ubuntu** and **12.84× on Windows** in compiler wall time on this selected source, subject to runner noise. Smaller depths do not show a consistent improvement. These numbers concern source analysis before execution and do not imply the emitted code is faster.

- **Unchanged control:** commit `5b6f5912c4abbff330b0076402f0a210973f12e1`, [full workflow 45050775649](https://github.com/FlareZ123/obfs/actions/runs/45050775649). **Ubuntu and Windows both completed successfully** with Node 22, project/external JSDoc and sampled performance; Ubuntu also passed real Chromium.
- **Memoized candidate:** commit `47efb5db9905810d7e1c4688b194a787d3858cc1`, [full workflow 45050779839](https://github.com/FlareZ123/obfs/actions/runs/45050779839). **Ubuntu and Windows both completed successfully** on the same full workflow, including Ubuntu real Chromium.

The `test/object-create-bound-count-memo-model.test.js` supplement includes a deterministic seeded graph corpus with independent exhaustive simple-path enumeration and an exhaustive three-node weighted edge grammar. The `test/object-create-bound-count-dag-crossfile.test.js` supplement compares native/emitted CJS behavior across COO/SNO/SCO, depths 2/5/8 and String-versus-Number descriptor getter controls: the String case must suppress eager string encoding, whereas the Number case must retain one positive encoding opportunity. Both supplemental test families passed **full Ubuntu and Windows validation** at immutable source `09d524cf0012793b2a60da7d4af844a86cad6949`, [run 45051234472](https://github.com/FlareZ123/obfs/actions/runs/45051234472), including strict project/external JSDoc, ordinary performance/profile steps, native/emitted CJS tests, and Ubuntu Chromium. The seeded weighted model logged **20,000 graphs and 129,168 independent root queries**; the exhaustive three-node model separately checked **59,049 root cases** over all 19,683 possible 3-node directed graphs with edges absent or weighted 0/1. This pin includes the cross-mode String-sensitive refusal and benign Number positive-encoding controls.

## Boundaries and review requirements

This candidate is stacked on older drafts #289, #239 and #217. It is independent of mainline and has not been integrated. The weighted graph model verifies the old recurrence on bounded synthetic inputs; the production call graph also contains AST constructors and holder-field aliases, so full source-pinned tests remain necessary. Acyclic graphs benefit most. Cycles can still induce repeated search and the optimization does not claim a general polynomial bound for arbitrary weighted cyclic provenance.

Even when emitted program parity passes, compiler speed cannot be credited toward the strict 2.5× **protected-work execution** budget. Existing release-blocking reconstruction, hostile-runtime and performance results remain intact.
