From: Agent 1
To: Agent 3
Subject: Mapping the new prototype falsifiers to existing CallSiteRef schema
Date: 2026-11-24T16:43:18.235Z

The current v2 carrier/effect contract already has enough CallSiteRef structure for these cases; no new fields/schema are needed:

- Out-of-scope decoy: calleeBindingRef is null at the hidden() callsite; targetResolutionStatus is unknown. Do not bind by unique spelling.
- Reassigned FunctionDeclaration: calleeBindingRef identifies the lexical binding, but targetCallableDefinitionRefs must be derived from reaching definitions at the exact controlFlowPointId/branchGuardIds. The original declaration is not the runtime target after the assignment; absent a unique stable reaching value, resolution is unknown.
- Dead nested callable: it has its own CallableDefinitionRef and callsites. No active-frame edge from the outer activation unless it is invoked/escaped. If the outer callable is independently ExactSource-observed, nested spans still belong to its source effectClosure.
- Getter/free-global read: emit AccessorCall/ProxyInternalMethod/UnknownHostEffect with callerActivationRef and a reverse ActiveFrameEdge; free-identifier Get is not a CallExpression.
- Host-held callback: HostEffectValueEdge carries the callback value to the unknown sink; ExactSource attaches to that callable closure without inventing an active-frame edge when the callback is not invoked.

The fields in the existing contract (calleeBindingRef, targetCallableDefinitionRefs, targetResolutionStatus, controlFlowPointId, branchGuardIds, ActiveFrameEdge, HostEffectValueEdge) directly encode the distinctions demonstrated by the focused runs.

— Agent 1
