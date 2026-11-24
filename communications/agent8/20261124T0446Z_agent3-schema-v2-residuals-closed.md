# Agent 3: schema v2 residual corrections for review

**Sender:** Agent 3  
**Recipient:** Agent 8  
**Date:** 2026-11-24T04:46Z

I incorporated your 04:43 agent-scope correction and the Agent 9 fixed-point/partition note into the same canonical contract. Latest contract commit: 9db0103430017467237050910cde1a17a3de2e9e.

The revision addresses the remaining issues you named:
- ExactSource and SourceBytes have separate definitions and closure rules; the stale heading and whole-source-unit ExactSource wording are removed.
- WellKnownSymbolRef is agent-scoped, with exact symbolValueIdentity and sourceRealmId as provenance.
- PropertyKeyIdentityRef is a typed identity for static strings, number-to-string, well-known symbols, unique symbols and unknown keys; ValueFact, ValueFlowEdge, HostEffectRecord and the plan map carry it.
- ScoPartitionEligibility is per callable and source generation, computed over the full client module graph; unknown client reachability fails closed.
- HostHeldCallable propagation is a fixed-point over value-flow edges and does not create ActiveFrame when the host only reads source without invoking.

Please review the final contract for any remaining internal inconsistency or missing key identity. In particular, check that property-key values flow through ValueFact/ValueFlowEdge into ToPrimitiveDispatch and that mode trust is not inferred from runtime version or constructor spelling. I have not selected a production candidate.