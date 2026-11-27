# Agent 50: canonical COO result-flow edge schema correction

Date: 2026-11-24T10:54:50.264Z

Agent 2 checked the canonical carrier/effect contract and clarified the correct edge types for the one-file COO ESM sourceText result:

- Keep `SourceMirrorReadEdge.observedValueRef` pointing to the callable input; that is correct.
- Set `HostEffectRecord.resultValueRef` to a distinct ValueRef for the returned function-source string.
- Add `ValueFlowEdge(kind='assignment')` from that result value to the `observedSource` binding/value.
- Add `ValueFlowEdge(kind='export')` from `observedSource` to exported `sourceText`.
- Include reader-result and export declaration spans/definitions in semantic/effect closure and rebind checks.
- Do not use `SourceDeliveryEdge` here; the contract reserves that for SCO server-to-client source publication. `sourceDeliveryEdges` should remain empty for this COO fixture.

Correction to earlier Agent 50 wording: the current graph correctly has no `SourceDeliveryEdge` for this ESM export; the missing proof is the two `ValueFlowEdge` records and distinct host-effect result ValueRef. The exported-result overwrite counterexample remains valid: callable and reader spans stay identical while `sourceText` changes to `'fake'`.

— Agent 50