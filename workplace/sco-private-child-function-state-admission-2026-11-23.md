# SCO private-child function-object state: proposed shared admission gate

**Status:** engineering work proposal and exact native-ESM counterexample; no general safety theorem and no source patch.

## Reproduced defect boundary

[Linux/Windows source-pinned probe 45139207858](https://github.com/FlareZ123/obfs/actions/runs/45139207858) at `b88473fd924f0c55964545584f228b1a2aaa1292` executes `test/sco-private-child-own-function-state-probe.test.js`. Its standalone selective SCO compilation succeeds for a private dependency exporting:

```js
export function next(){
  next.count=(next.count??0)+1;
  return next.count;
}
```

The root's selected private export merely calls `next()`. The composed `partitionScoSelectedGraph` refuses that child; the standalone `partitionScoSelectedAsyncExports` still admits it. Three independent Node ESM directory trees demonstrate outputs `[1,1,1,2]` for first client A, first client B, first server, second server. Under the original per-client module-instantiation contract, a single shared trusted Node dependency changes the observed function-object counter across users.

The graph's source-level `assertImmutablePrivateModuleTopLevels` checks both module-level state and first-class use of declared functions, whereas standalone `collectPrivateStaticImportClosure` performs sophisticated global/loader/host auditing without a matching local declared-function identity check. This discrepancy persists after the successful root import alias guard `src/sco-private-import-identity.js`, because root direct calls to imported functions remain eligible.

## Candidate design

Factor the graph's private-child function state admission into a shared module consumed by both graph and standalone private-source closures. Where possible, perform identity analysis on the already parsed AST during the source-closure traversal to avoid additional source parses; preserve path-specific diagnostics and one-time immutable source snapshot semantics. The default policy should refuse observed top-level function-object own-property reads/writes and identity escapes that can carry mutable state from independent client ESM instances into a shared server singleton. The existing graph function declaration guard is a useful conservative first baseline.

The graph currently permits top-level static imports and non-generator function declarations and primitive immutable literal constants; standalone static source admission may accept more complex modules. Do not transplant all graph top-level restrictions without first inspecting legitimate standalone fixtures and the documented server-only state contract. A narrow shared function-object identity guard may be less destructive than broad module-level immutability, but it still needs lexical provenance or conservative declines for aliases, return carriers, computed properties and reflection.

The root first-class identity guard and child-state guard should remain conceptually separate. A syntactically direct `return next()` proves only that the root does not retain the function object; it does not prove that `next` is free of its own mutable singleton state. Ideally require a child-return/call summary showing absence of per-client observable state. When that summary is unavailable, decline or explicitly document a different integrator-provided state-sharing contract, never silently advertise 1:1 browser semantics.

## Acceptance controls

The red diagnostic above needs a **new refusal expectation** once a repair is proposed; a test that currently passes to record the bug is not green safety validation. Preserve the native `[1,1,1,2]` witness, a deterministic stateless imported-function direct-call positive case, private primitive import arithmetic, and source-integrity/canonical-child-path fixtures. Run existing `test/sco-selective-private-import-identity.test.js`, `test/sco-selected-graph-expression-alias.test.js`, `test/sco-selected-graph-state.test.js`, `test/sco-selected-graph.test.js`, and the broader standalone selective partition suite against the same source. After a focused native behavior and strict JSDoc gate, coordinate **one** full mainline source-pinned Linux/Windows/Chromium/benchmark verdict with Agent 10; do not multiply overlapping integration branches.

The last observed full source `72e1c170b28b165c150a12df1d12ee21cf4b891c` is already **RED** on both OS with 17/5,126 Node failures from unrelated protected-property positive-yield fixtures. Distinguish this baseline from any new private-child source rejection rather than claiming global green after a focused pass. Neither this proposal nor a future refusal guarantees adversarial secrecy or universal <=2.5× compute.
