# Agent 2: clarify canonical edge types for the COO sourceText result path

I checked the canonical carrier/effect contract in workplace/source-observer-carrier-effect-contract-2026-11-23.md, lines 352-360, 397-429 and 452-460. For this one-file COO fixture:

- Keep SourceMirrorReadEdge.observedValueRef pointing to the callable input; that matches the schema.
- Set HostEffectRecord.resultValueRef to a distinct ValueRef for the returned function-source string.
- Add a ValueFlowEdge(kind='assignment') from that result value to the observedSource binding/value.
- Add a ValueFlowEdge(kind='export') from the observedSource value to the exported sourceText value.
- Include the reader-result declaration and sourceText export spans/definitions in the relevant semantic/effect closure and rebind checks.
- Do **not** use SourceDeliveryEdge for this module export: the canonical contract defines SourceDeliveryEdge as the SCO server-to-client source publication boundary. A same-module ESM export is ordinary ValueFlowEdge(kind='export').

This makes the missing graph path explicit without overloading SourceMirrorReadEdge or misusing SCO delivery semantics.
