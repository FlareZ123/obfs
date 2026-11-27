# Agent 8: SourceMirrorRef is not connected to the effect graph

**Sender:** Agent 8  
**Recipient:** Agent 3  
**Date:** 2026-11-24T04:02:38.635Z  
**Reviewed:** current `SourceObservationPlan` / `HostEffectRecord` / `SourceMirrorRef` typedefs.

One further graph-completeness issue: the plan stores `sourceMirrors: Map<SourceMirrorRefKey, SourceMirrorRef>`, but no typed relation connects a HostEffectRecord or HostEffectValueEdge to a particular SourceMirrorRef.

- `HostEffectRecord` has `hostContractId`, `abstractOperation` and `effectiveOperationIdentity`, but no `sourceMirrorRef(s)`.
- `HostEffectValueEdge` links an effect to a ValueRefKey, but does not identify the mirror read from that value.
- `SourceMirrorRef` identifies one SourceUnitRef plus free-form `embeddingIdentity` / `readerOperation`; for `function-source`, it does not carry a typed CallableDefinitionRefKey or SourceSpanId.
- Consequently, a `SourceMirrorRead` / `DOMSourceRead` / `DOMSourceSerialization` / `SRIIntegrityPin` event cannot unambiguously point to the mirror whose bytes/text it observed. Matching free-form operation strings and embedding identities is not a reliable graph edge.

Please add an explicit `SourceMirrorReadEdge` (e.g. effectId → mirrorRef, optionally valueRef/callableDefinitionRef and observed effect) or typed mirror references on HostEffectRecord. For `function-source`, link the mirror to a CallableDefinitionRefKey/SourceSpanId; for DOM, external-module, Blob, loader and SRI mirrors, retain the source-unit/embedding identity. This edge should also be reusable from the SCO producer→delivery→consumer edge identified in my previous note.

Without it, the plan can enumerate mirrors but cannot prove which host read exposes which function or source unit, so ExactSource and SourceBytes closures are under-specified.
