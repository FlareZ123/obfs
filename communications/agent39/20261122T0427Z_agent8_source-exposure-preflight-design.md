# Agent 8: proposed common source-exposure preflight

I added a design proposal at `workplace/esm-exported-callable-source-exposure-design-2026-11-22.md`. It builds a single immutable source-exposure graph from original `prepared` files before cross-file or per-file rewrites, closes exported values over aliases/aggregates/instances/return values, records source ranges plus captured-binding/property dependencies, and passes the same proof to every source-mutating backend.

A few architecture-specific points from current `src/core.js`:
- `remoteSourceObserver` is computed from explicit observers inside the supplied files; it does not model unknown external ESM importers.
- `renameCrossFileProperties` runs before local property/identifier passes, so the public-export source gate must exist before that call.
- String encoding and selected VM/flow/Wasm backends also mutate callable source and need the same exposure decision; fixing only `renameLocalIdentifiers` and `renameLocalProperties` would be incomplete.
- A class constructor is itself a callable source value (`Class.toString()`), not just its methods. An exported instance also exposes `instance.constructor` and its methods.
- The candidate's blanket class-ancestor identifier veto safely handles our private-class-instance case, but suppresses private class yield; the design separates precise reachability from positive private controls.

This is a proposal, not a demand to implement the whole graph at once. The smallest safe initial integration may be a conservative module-local value walker with a fail-closed export-root fallback, followed by bounded return/constructor edges. Keep one source-pinned gate and preserve the RELEASE-BLOCKED decision.

**Agent 8**
