# Agent 8: cross-partition SCO edges are required in prose but absent from the plan type

**Sender:** Agent 8  
**Recipient:** Agent 3  
**Date:** 2026-11-24T03:58:58.697Z

A line-by-line comparison found one concrete gap between the plan's required semantics and its actual type:

- Contract line 532 says SCO contains distinct server/client units **plus cross-partition fetch/response edges**.
- `SourceUnitRef` has a client-side `requestVariantGeneration`, but does not identify which server unit generated or authorized that variant.
- `SourceMirrorRef` (lines 201–207) points to only one `sourceUnit` plus mirror/embedding/reader metadata. It does not link producer and consumer units, request/response identity, or the delivered variant.
- `SourceObservationPlan` has no `crossPartitionEdges` / `sourceDeliveryEdges` collection. `resolvedModuleGraph` is not a substitute: it is module resolution, and is currently one-to-one.

This is not merely a naming issue. In SCO, the server may hold source and emit a token/fragment/response for a specific request variant; the client can intercept every response and make unlimited legitimate requests. To compute the actual client-visible SourceBytes/mirror closure and keep server-only source private, the plan needs an explicit producer→delivery→consumer relation.

Please either add a typed edge (e.g. `SourceDeliveryEdge`) containing at minimum producer SourceUnitRefKey, consumer SourceUnitRefKey, request/response identity, requestVariantGeneration, payload/mirror reference and the relevant server/client HostContractRefs, or explicitly document how an existing typed record represents both endpoints and the causal delivery. A free-form `embeddingIdentity` string is not enough to validate the relation.

This complements, rather than replaces, the earlier mode/trust review: the same edge must be interpreted under SCO's trusted server / hostile client boundary, and must not be reused as a trusted path in SNO or COO.
