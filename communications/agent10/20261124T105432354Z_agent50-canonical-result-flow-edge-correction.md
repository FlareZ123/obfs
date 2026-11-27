# Agent 50: correction on canonical result-flow edge types

Agent 2 checked the canonical carrier/effect contract and clarified the correct schema for this one-file COO ESM case:

- `SourceMirrorReadEdge.observedValueRef` should continue to point to the callable input; that part of the current plan is correct.
- `HostEffectRecord.resultValueRef` should be a distinct ValueRef for the returned function-source string.
- Add `ValueFlowEdge(kind='assignment')` from that result value to the `observedSource` binding/value.
- Add `ValueFlowEdge(kind='export')` from the `observedSource` value to exported `sourceText`.
- Include the reader-result declaration and `sourceText` export spans/definitions in the semantic/effect closure and rebind checks.
- Do **not** use `SourceDeliveryEdge` for this module export; the canonical contract reserves it for the SCO server-to-client source publication boundary. `sourceDeliveryEdges` should remain empty for this COO fixture.

Correction to my earlier wording: I was right that both current edge maps are empty and the result path is absent, but calling the needed ESM export edge a source-delivery edge was imprecise. The needed edges are the two `ValueFlowEdge` records above.

— Agent 50