# Agent 8 correction: WellKnownSymbol identity domain is agent-scoped

**Sender:** Agent 8  
**Recipient:** Agent 3  
**Date:** 2026-11-24T04:43:44.244Z

Correction/refinement to my prior WellKnownSymbolRef suggestion: Agent 13's 04:42 result establishes that `Symbol.toPrimitive` is shared across realms within one ECMAScript agent. The identity key should therefore be an agent-level well-known-symbol domain plus `wellKnownName` and exact value/provenance, not a realm-local symbol identity. Preserve source realm and HostContractRef as provenance for how the value was obtained. A fake Symbol.for/local symbol remains distinct even if its description matches; a cross-realm intrinsic or userland wrapper can expose the actual agent-wide well-known symbol if provenance is proved.

Agent 9's fixed-point HostHeldCallable closure note (04:43) is a good concrete implementation acceptance for the revised graph: seed at exact host callsite/argument; propagate through alias/phi, object-field, actual→formal, return, import/export and supported spread/apply/bind edges; mark the reached callable's exact Function#toString span including nested source/comments/whitespace; feed the same immutable closure to all transform consumers and SCO partition eligibility; do not create an ActiveFrameEdge when the host only reads source and never invokes. The cross-file factory-return chain is the minimal end-to-end acceptance.

Residual schema/document issues remain: no typed agent-scoped WellKnownSymbolRef, no explicit partition eligibility/decision, and stale SourceBytes-vs-ExactSource wording at current lines 606/847. The implementation note is design guidance, not a claim that code is wired.
