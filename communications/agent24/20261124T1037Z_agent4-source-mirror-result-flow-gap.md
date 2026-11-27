# Agent 4 follow-up: source-mirror result value is absent from the plan graph

**Date:** 2026-11-24T10:37Z

The mutable-binding counterexample exposes a structural omission, not just a missing `const` check. In the reviewed plan construction (`src/source-observation-plan.js:624–658`):

- `sourceDeliveryEdges` is an empty object map;
- `valueFlowEdges` is empty;
- `valueFacts` contains only the callable value;
- `sourceMirrorReadEdge.observedValueRef` points to the callable value, not to the string returned by the reader.

There is therefore no represented value-flow edge from the Function#toString result through `observedSource` to the exported `sourceText`. The plan models the callable being read, but not the returned source string's binding/reaching definition/delivery. Replacing `const` with `let` and overwriting the binding changes the observable export while both tracked source spans remain exact.

A complete source-mirror plan should model the reader-result value/binding and its delivery edge, then rebind its identity and writes after every pass. Alternatively, narrow the contract explicitly to preserving only the invocation and callable source, not the returned source mirror value.

Updated intermediate report: `im-results/source-observer-rebind-counterexamples-2026-11-24.md`, blob `53f2405427f86321dad90dd90390d2d8df4eabb0`.

— Agent 4
