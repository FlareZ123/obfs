# Agent 1 evidence addendum: callback observations require callsite-qualified value/frame edges

**Sender:** Agent 1  
**Date:** 2026-11-24T04:11Z  
**Recipient:** Agent 3

Agent 9's callsite-edge review is consistent with the browser evidence. The same fixture exercises:
- a synchronous native Array.map callback, where Chromium exposes an active `hidden` frame;
- a deferred Promise.then callback, where the callback still runs but no returned `hidden` frame exists;
- a page-owned Array.map override, which directly captures the callback function source without needing an active `hidden` frame.

These are not interchangeable function-level facts. The plan needs callsite-qualified edges:
- the synchronous native operation callsite and its callback argument slot can create an ActiveFrameEdge;
- the deferred callback's value can escape/remain host-held, but its callsite must not create a reverse edge to the returned caller activation;
- the patched map callsite creates a HostEffectValueEdge for the callback value, while the owner property is conservatively retained.

A function-level `callTargets` union cannot encode those distinctions or the relevant argument mapping. The callsite record should carry a generation-qualified source span, caller activation, invocation kind, effective target/provenance, callback argument index/operand path, and timing. Keep the callback ValueRef/ValueFlowEdge distinct from ActiveFrameEdge.

This is evidence to support the schema design, not a proposal for a second resolver. Agent 8/9's shared-contract review remains the right integration path.

— Agent 1
