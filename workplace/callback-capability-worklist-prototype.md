# Capability-flow worklist prototype: finite forward may-facts with witnesses

**Agent 21, 2026-11-23, status: independent simulation/infrastructure.** Implementation: `sims/callback-capability-worklist.js`; tests: `test/callback-capability-worklist.test.js`. This code is **not** connected to the production compiler, does not parse ASTs, and **does not authorize any property rename**. It is a small basis for source- and module-aware refactoring research.

## Model

The graph has explicit stable node names representing hypothetical lexical bindings, allocation-site fields, ESM exports/imports, function returns, callback schedules, Promise fulfillments and opaque invocations. Each edge has a transfer kind and each seed is one of five abstract facts: `host-callable`, `returned-holder`, `opaque-host`, `owner-reflection`, `dynamic-import`. Transfer propagates those may-facts monotonically. Each first-added `(node,fact)` records the predecessor edge that justified it; `explain(at,fact)` reconstructs one root-to-sink witness path, not a trace of actual JavaScript execution.

Algorithm: process a queue of newly discovered `(node,fact)` pairs; propagate to outgoing edges and do not enqueue a pair already seen. With a fixed finite list of nodes, transfer edges and fact types, each node/fact is enqueued at most once and termination follows. The number of attempted edge propagations is bounded above by the product of edge count and fact-domain size for the supplied model, with normal duplicate pairs skipped. A configured explicit step cap throws rather than reporting a possibly unsafe false negative. Re-solving starts from persistent seeds and recomputes the fixed point, including newly added graph edges.

This model is **only as conservative as its caller's edges and host-contract classification**. Missing a dynamic property write, a getter, a Promise callback, a proxy, an ESM edge or an unknown native effect could incorrectly make a value appear unreachable. Neither its basic unit tests nor its finite graph proof establish a sound points-to frontend for arbitrary JavaScript.

## Reproducibility

`node --test test/callback-capability-worklist.test.js` exercises:

1. one explicit host Function → wrapper return → ESM holder field → Promise schedule/fulfillment → opaque dynamic-import may-path, asserting its exact predecessor witness;
2. a cyclic alias/heap graph with source/sink reachability and finite processing;
3. independent `opaque-host` and `dynamic-import` facts joining at one observer without silently merging or dropping unknown facts;
4. deterministic recomputation after a new ESM edge;
5. a 1,200-node bidirectional chain with a bounded 2,400-edge traversal and a complete witness;
6. explicit exceptions on unrecognized facts/edges, empty node IDs, or insufficient finite step budget.

At source `91013a00fbbff9745488772b2c423311ba636b11` on immutable `agent21/callback-worklist-prototype-20261123`, focused [Ubuntu/Windows Node22 CI 45122371249](https://github.com/FlareZ123/obfs/actions/runs/45122371249) passed **6/6 tests on both OS** and strict project/external JSDoc typechecks. It does not measure emitted program runtime or any obfuscation resistance.

## Next research requirements

Before connecting to `safeClosedCallerRecordRead`, supply a frontend that assigns stable lexical binding IDs per module/scope and allocation-site IDs per object/function. Build heap field read/write edges with wildcard property names, source-visible function argument/return edges, native adaptor effects, scheduling/await edges, module import/export and dynamic import paths. Require a regression corpus that compares original/emitted real Node ESM and Chromium behavior under explicit host contracts and preserves nonzero private rewrites. Treat all unmodeled host effects as top, not as absence. Prototype a reason-carrying property-refusal report with witness paths so false-positive protection-yield losses can be distinguished from safety refusals.

The immediate motivation is [draft PR #332](https://github.com/FlareZ123/obfs/pull/332), which fixes selected real callback/cross-file published-owner mis-renames but still uses a bounded name-based heuristic. The worklist is a separate proof-of-concept, **not** a fix for those errors or an acceptable release gate by itself. See `workplace/async-host-capability-worklist-design.md` and `resources/javascript-async-callback-static-analysis.md` for the longer architecture proposal and cited background.
