# Source-visible ambient capability from assignment-pattern destructuring

**Agent 6, 16 November 2026. Intermediate compiler-correctness result.** Builds on the earlier computed destructuring declaration repair (merged PR #28) and exact-null-prototype positive source proof (merged PR #29).

## Counterexample

A closed-world COO three-module real Node ESM application exports `state={secretField:41}`. An unrelated record's `Reflect.ownKeys(schema)` is expected to be native by the cross-file safe-record exception. Its entry module can execute:

    let capability;
    ({['Ref'+'lect']:capability}=globalThis);
    capability.ownKeys=globalThis.HOST_REFLECT;

The unchanged preloader defines `HOST_REFLECT`, which dynamically imports the other `state.mjs` and observes `Object.keys(m.state)`. The compiler must not rename `secretField` under this source-visible native method mutation. Earlier declaration-form syntax `const {['Ref'+'lect']:capability}=globalThis` was covered, but the same capability can be acquired by assignment into a predeclared local, forwarded again, or extracted from a proven local alias of the global root.

The narrowly scoped alias proof already collected assignment-form ordinary identifier edges and their transitive forwarding. It only added newly destructured global capabilities to `hostCallAliases` when the AST node was a `VariableDeclarator`. The fix normalizes both `VariableDeclarator` and plain `AssignmentExpression` into common `binding` and `value` nodes, then applies existing host-root provenance and alias propagation. The earlier source-visible member-write exclusion reuses `hostCallAliases` unchanged.

## Exact tests and validation

[Three additional ESM fixtures](../test/closed-record-destructured-global-capability.test.js) cover assignment extraction, forwarded alias, and extraction from a local alias of `globalThis`. Each compares native and emitted Node ESM under the exact same fixed host preloader, requires a zero property rewrite for the negative cases, and separately retains an unrelated one-key positive.

- **Pre-fix confirmed red** source SHA `acc19aa60cb84db684e13edfed9339a9aa2d8cc1`: [full manual validation 43879639756](https://github.com/FlareZ123/obfs/actions/runs/43879639756) failed in exactly the three new assignment-pattern semantic cases on **both Ubuntu and Windows**, while preserving other tests. On Ubuntu the suite reported **1697 tests, 1693 passed, 3 failed, 1 skipped**. Actual emitted host-observed keys were `_pc9214b319f54`, `_p6daa2ede5bd6`, `_pf6eedc50a725`, while every native case expected `secretField`. This is a genuine native-vs-generated mismatch, not a static heuristic-only false positive.
- Bounded alias scanner patch `748b48dfe4280c7caf83f5132e0052c732704760`: [full manual validation 43879794268](https://github.com/FlareZ123/obfs/actions/runs/43879794268), dispatched against that exact SHA and pending at initial report.
- The test must continue to preserve positive key transformation on the previously accepted unrelated global read. Fail-closed semantics alone would not demonstrate useful protection coverage.

## Limitations

This repair is a finite alias pattern recognition improvement. It is not an interprocedural whole-program host effect proof, does not establish resistance to dynamic runtime extraction or tampering, and does not solve authorization in a client-controlled runtime. Arbitrary callbacks, Proxy traps, opaque host functions, dynamic assignment receivers and custom module loaders remain general limitations. Performance is unchanged in already-safe emitted paths and still demands independent 2.5× measurement for specific complete workloads.
