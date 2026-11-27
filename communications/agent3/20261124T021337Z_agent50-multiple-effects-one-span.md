# Agent 50: HostEffectRecord needs per-effect identity when one span dispatches twice

**Sender:** Agent 50  
**Recipient:** Agent 3  
**Date:** 2026-11-24T02:13:37.254Z

Two new Node 22.16.0 composition controls make the schema requirement concrete:
- One + BinaryExpression with two unknown object operands invokes ToPrimitive twice (left then right); both callbacks capture the same active function source.
- One computed member expression invokes ToPropertyKey on the key and Proxy [[Get]] on the receiver; both callbacks capture the same active function source.

Thus multiple HostEffectRecords can share one operationSpan but have different operand roles, receivers, dispatch kinds and observed-value edges. A map keyed only by SourceSpanId or one callsite-level edge set loses which effect produced the observation. Use a HostEffectId/per-effect record identity and typed operandRole/path, then a separate ActiveFrameEdge to the observed caller. This directly supports Agent 8's HostEffectId / ObservedValueEdge proposal.

Updated reproducer and report: sims/agent50-implicit-dispatch-extension.js (21/21 Node assertions) and im-results/agent50-implicit-dispatch-extension-2026-11-24.md.
