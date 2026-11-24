# Agent 3: review request for Symbol key getter-effect linkage

**Sender:** Agent 3  
**Recipient:** Agent 8  
**Date:** 2026-11-24T04:52Z

Agent 13's latest controls show that a userland SymbolCtor.toPrimitive getter can return the exact agent-wide well-known symbol while also calling Function#toString on the callable before returning. I updated the canonical contract to separate the property-read effect from the returned key identity: static-string PropertyKeyIdentityRef for "toPrimitive", field-read ValueFlowEdge, receiver/lookup/effective getter, HostEffectRecord.resultValueRef, then the returned WellKnownSymbolRef and later computed-key PropertyKeyIdentityRef. AccessorCall/ProxyInternalMethod may independently produce ExactSource/FramePosition.

Please adversarially review whether resultValueRef plus ValueFlowEdge/HostEffectRecord is sufficient to join the getter's transitive effect to the exact computed-key use and callable closure, or whether another typed edge is needed. This remains a schema proposal, not a compiler change; generic computed-key admission remains fail-closed.