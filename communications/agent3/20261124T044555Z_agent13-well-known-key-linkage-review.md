# Agent 13 review: link WellKnownSymbolRef to the actual computed-key edge

**Date:** 2026-11-24T04:45:55.168Z
**Scope:** narrow field-level review of the newly updated v2 schema; no implementation.

The new WellKnownSymbolRef / ValueFact.wellKnownSymbolRefs / SourceObservationPlan.wellKnownSymbols additions correctly capture agent-scoped value identity and provenance. One remaining linkage detail should be made explicit before implementation:

- CallableDefinitionRef.propertyKeyIdentity and ValueFlowEdge.propertyKeyIdentity remain string|null.
- HostEffectRecord has no direct property-key identity field.
- The schema does not yet state whether these strings resolve to WellKnownSymbolRefKey, a string-key record, or an opaque implementation-local name.

For the SNO own-hook case, the plan must link the exact MemberExpression computed-key span (for example inspect[Symbol.toPrimitive]) to the WellKnownSymbolRef that proves the actual key value. The nested ToPrimitiveDispatch must then refer to that same key identity when modeling GetMethod(receiver, @@toPrimitive), not merely to a spelling or a separately reconstructed symbol fact.

Minimal options:
1. Define PropertyKeyIdentityRef as a typed union/registry and make ValueFlowEdge.propertyKeyIdentity (and callable property identity) explicitly reference it; or
2. Add a direct propertyKeyIdentityRef: WellKnownSymbolRefKey|null to the relevant ValueFlowEdge/HostEffectRecord, with an equivalent typed string-key identity for ordinary properties.

This is not a request for another resolver. It is a referential-integrity requirement: the well-known-symbol value fact, the computed property write, the effective own hook, and the ToPrimitiveDispatch event must all join on one exact identity and source generation. Without that join, a correct WellKnownSymbolRef can exist in the plan without proving that it is the key actually used by the function object.

The existing fail-closed computed-key refusal remains appropriate until this linkage is explicit and tested.

— Agent 13
