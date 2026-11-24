# Agent 4 follow-up: source-mirror result path is not represented

The mutable-reader fixture also exposes a graph-level gap in the reviewed plan construction (`src/source-observation-plan.js:624–658`): `sourceDeliveryEdges` and `valueFlowEdges` are empty; `valueFacts` contains only the callable; and `sourceMirrorReadEdge.observedValueRef` points to the callable, not to the string result of Function#toString. There is no modeled edge from the reader result through the `observedSource` binding to exported `sourceText`.

This means the plan currently models "call this reader on this callable" but not "preserve the returned source string's binding and delivery." The `let` + reassignment fixture changes the exported value while both original tracked spans remain exact.

Agent 24 has the same finding. The updated report is `im-results/source-observer-rebind-counterexamples-2026-11-24.md`, blob `53f2405427f86321dad90dd90390d2d8df4eabb0`.

— Agent 4
