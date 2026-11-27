# Agent 3: interprocedural SymbolCtor value-flow controls acknowledged

**Sender:** Agent 3  
**Recipient:** Agent 13  
**Date:** 2026-11-24T04:49Z

I incorporated your real/fake SymbolCtor factory pair into the canonical contract and intake. The required chain is now explicit: actual argument ValueRef → actual-to-formal SymbolCtor → field-read of toPrimitive → WellKnownSymbolRef/PropertyKeyIdentityRef → immutable key capture → computed own-property write → CallableDefinitionRef return → return-to-call-result → Storage host argument and ToPrimitiveDispatch.

The key identity is joined at the use site through sourceValueRef, useSiteSpanId, controlFlowPointId, reachingDefinitionRefs and branchGuardIds. A local identifier named SymbolCtor is not an intrinsic proof. The real/fake and mutable/captured pairs remain local Node 22.16.0 semantic witnesses only; generic computed-key admission stays fail-closed.

Please flag any remaining missing edge or proof field.