# Imported private-reader and ESM-cycle matrix

**Status:** intermediate, reproducible test evidence; not an established security result.

## Source pin and method

Review-only branch: `agent7/owner-reexport-cycle-tdz-review-20261126`.

Tested commit: `7b675dec16adcc1eb18004310690a094b4b4febe`, based on PR #379 candidate head `88c66048c01dde3ba54fbf1b2da14f65d490c087`. The later PR head `bafc473...` changes only fixture line-separator strings in `test/function-declaration-reader-proof.test.js`; the production source pin used here is unchanged by that commit, but the full validation suite still needs to be rerun against the corrected fixtures.

The branch adds tests to `test/cross-file-reader-flow.test.js` and updates the `examples/closed-graph-host` sample. It does not modify production source or PR #379.

## Reproducible observations

Workflow: [manual-cross-readers run 45776080387](https://github.com/FlareZ123/obfs/actions/runs/45776080387).

Both Ubuntu and Windows jobs completed successfully. The cross-file differential/negative step, generated host-lock artifact verification, native/emitted ESM graph behavior, public-only guard-removal reproduction, workload profile, source normalization, and strict JSDoc steps all passed. Chromium origin/import-map steps ran on Ubuntu and were skipped on Windows as configured.

### Positive private-reader lane

For an imported owner object, two private, direct-call-only FunctionDeclarations can be used behind an exported wrapper:

```js
function metric(metricOwner) { return metricOwner.privateMetric; }
function weight(weightOwner) { return weightOwner.weightedFactor; }
export function read() { return metric(state) + weight(state); }
```

With distinct parameter bindings, the test observes **two cross-file property rewrites** and exact native/emitted output parity in COO, SNO and SCO.

The closed-graph host example now uses this pattern. Its generated output is byte-verified by `examples/closed-graph-host/build-sample.cjs`; the workflow verifies one owner object and two rewritten properties.

### Conservative boundaries

The matrix also asserts zero rewrites and native/emitted parity for:

- the same two private readers when both parameters are spelled `owner`;
- an imported owner captured by a private closure reader rather than passed as a reader parameter, in an acyclic graph;
- the corresponding deferred closure-reader pattern in a cyclic graph;
- a self-import through a named owner re-export cycle with an early TDZ read.

The same-spelling case is explained by the current proof's globally name-keyed binding counts and alias set: two distinct function-scope parameters named `owner` are treated as ambiguous. Simply removing the uniqueness guard would be unsound because the parameters could receive different objects. A general yield improvement requires lexical binding identities / scope-aware aliases.

The closure-reader cases are currently refused even when the owner is imported and the helper is private. The accepted path is narrower: a private reader with one provable owner parameter and a direct static member return (or the exact supported local-temp form). The cyclic case is also fail-closed. These are yield limitations, not observed behavior mismatches.

## Relationship to other work

This extends `im-results/agent1-bounded-private-reader-proof-2026-11-26.md` with an imported-owner consumer case and a cycle matrix. It is distinct from the one-hop exported-reader forwarding work in `im-results/one-hop-private-cross-file-reader-proof-2026-11-22.md`.

The closed-graph sample previously failed its expected 1-object/2-property assertion on main and in historical main CI. The candidate branch's parameterized private-reader proof allows the sample to express the intended public wrapper without exposing field names in that wrapper; the updated sample now passes both OS jobs.

## Limitations and next work

1. Merge/cherry-pick the test and example updates into the current PR #379 candidate after checking its latest head.
2. Rerun the unfocused full validation gate at the corrected PR head. Run 4262 was pinned before the latest test-fixture newline correction, so its added-test count is provisional.
3. If improving yield, replace global spelling-based alias identities with a scope-aware binding graph; retain negative tests for shadowing and distinct same-spelled bindings.
4. Treat closure-reader and cyclic-owner support as separate proof extensions. Require explicit evaluation-order and escape evidence; do not weaken fail-closed behavior to gain rewrites.
5. Do not infer tamper resistance or confidentiality from successful property renaming. The public-only source-normalization and host-guard removal attacks remain separate threat-model evidence.
