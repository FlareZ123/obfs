# Cross-realm intrinsic identity mutation: deterministic 220-case grid

**Author:** Agent 29, 2026-11-15. **Evidence status:** Intermediate engineering and compatibility result; not an academic security result.
**Immutable source:** `2ccc4e5574e44374869dc6c51309fc54d778c7dc`.
**Linux/Windows pinned manual SCO gate:** [43776297613](https://github.com/FlareZ123/obfs/actions/runs/43776297613), **success in both lanes**.

## Question and threat context

A JavaScript module originally runs its functions against one set of native builtins. Selective SCO partitioning moves a chosen async export to the server and keeps another export in a separate browser realm. If private code mutates a builtin object and public code reads it, the two realms no longer share that mutation. The same effect can be hidden behind aliases of `globalThis`, mutable member functions, arrays, object literals, or destructuring patterns.

The correctness question is whether the selective compiler **refuses** a demonstrably mismatched split before emitting the public RPC facade, while continuing to accept useful independent read-only computations. These checks do not speak to source confidentiality against runtime attackers.

## Reproducible method

`test/sco-intrinsic-shape-grid.test.js` generates 22 source variations for each of ten builtin roots: `Math`, `JSON`, `Number`, `String`, `Date`, `RegExp`, `Object`, `Array`, `Error`, and `Promise`.

For each root, 16 constructions mutate a canary property on the root object through direct access, simple or transitive global aliases, object/array carriers, direct immutable aliases, an identity function, `Object.assign`, static global-property names, and defaulted destructuring. Six more constructions mutate a canary property of a **native member object** (for example, `Math.imul`, `JSON.stringify`, `Number.isFinite`, `RegExp.prototype`) via a nested pattern, direct member alias, carrier, deep property write, or `Object.assign`.

For each of the **220** cases, the test independently verifies with `node:vm` that the original writer and reader running in the **same** context observe `41`, while the original reader running in a fresh second context observes `0`. Only after verifying this native semantic mismatch does the test invoke the *actual* `partitionScoSelectedAsyncExports` compiler and require that the partition be rejected. The grid also requires **seven** preselected, read-only numeric/property-call controls to remain admitted.

The grid is deterministic and has no random oracle, assumed import provenance, or private compiler internals. Source validation is pinned to Node 22 in the manual SCO workflow on Ubuntu and Windows; neither OS pass is evidence of generic browser realm semantics for untested APIs.

## Compiler response

`src/sco-selective-partition.js` now uses a bounded fixed-point origin classifier for intrinsic aliases and global roots. It adds first-class member values, such as `Math.imul` and `JSON.stringify`, to the same conservatively recognized identity set if their provenance is explicit. Deep writes such as `Math.imul.x = ...` are recognized via a member-chain walk. Passing a native member to unknown code, returning a native function value from a private RPC, or copying it into a carrier is also refused. Standard immutably numeric `Math`/`Number` constants are separately identified so ordinary reads and native calls remain usable. Nested and defaulted destructuring of an intrinsic root remain refused when no bounded direct provenance fact can be constructed.

This approach refuses much legitimate source code, especially function-object identity comparisons and unknown intrinsic-member values. It remains conservative and syntactic, and the fixed point is an overapproximation rather than a precise lexical binding or mutation-order proof. Runtime replacement of global constructors and arbitrary getters/proxies remain out of scope.

## Observed outcomes

| Metric | Observation |
|---|---:|
| Unsafe source shapes generated | 220 |
| Native same-realm canary observations | 220/220 yielded 41 |
| Native separated-realm observations | 220/220 yielded 0 |
| Compiler refusals for mismatched splits | 220/220 |
| Selected read-only safe controls admitted | 7/7 |
| Pinned cross-platform SCO CI gate | Ubuntu + Windows passed |

The gate also included its existing authenticated RPC, partition, helper, state-isolation, Chromium and JSDoc steps. Its success is evidence for those exact workflows at the stated source revision, without proving all three obfuscation modes or a universal 2.5× runtime cap. The measured test-grid runtime is only compiler/test harness activity and cannot substitute for a protected-application performance result.

## Unresolved cases and priorities

1. The classifier has no general escape/provenance theorem for object graphs, dynamic member keys, closures, proxies, cross-file imports or arbitrary callbacks.
2. Mutation of builtin instances, iterator state, shared host globals and browser-only APIs may still cross the server/client boundary unnoticed.
3. The admission rate on representative real applications is unknown. More refusals could make selective SCO impractical despite improving compatibility for the tested patterns.
4. Browser/server transport changes asynchronous sequencing and error identity. This grid intentionally isolates builtin-state splits, without asserting full behavioral equivalence or hostile-client integrity.
5. For the primary protection objective, source-private SCO still permits legitimate online RPC relay and black-box learning. No increased difficulty of adversarial program reconstruction follows from these compiler refusals.

The per-shape compiler regression and independent VM witness are directly reproducible via `node --test test/sco-intrinsic-shape-grid.test.js` after installing the repository dependencies. The manual SCO workflow runs this file on both major host platforms.
