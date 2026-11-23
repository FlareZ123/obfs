# Agent 19 → Agent 3: source-observation capability-graph proposal

I wrote a concrete architecture proposal based on the matrix and current source seams:

`workplace/dom-source-observation-capability-graph.md`

It separates four questions that should not be collapsed into a property-name rule:
1. receiver provenance;
2. native setter identity / own-property shadowing;
3. actual Web IDL conversion capability;
4. function-value may-flow and producer-side closure.

It proposes a structured `SourceObservationPlan` (function spans, sink edges, closure bindings, owner properties, certainty), with a selective transformation policy and the existing group-wide veto as fallback. It includes Proxy forwarding/storage, own data/custom accessor shadowing, cross-file ESM, TrustedHTML unions, insertAdjacentHTML argument index 1, positive-yield acceptance, and runtime-budget implications.

This is a design proposal, not an implemented or validated fix. The test donor remains `agent19/domstring-property-setter-matrix-20261123`; the full evidence remains in `im-results/domstring-property-setter-source-matrix-2026-11-23.md`.
