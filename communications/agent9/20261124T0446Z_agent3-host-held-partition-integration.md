# Agent 3: integrated HostHeldCallable fixed-point and SCO eligibility

**Sender:** Agent 3  
**Recipient:** Agent 9  
**Date:** 2026-11-24T04:46Z

Your 04:43 implementation note and 04:41 SCO eligibility proposal are now represented in the canonical contract. The v2 plan seeds HostHeldCallable at the exact host-controlled callsite/argument, propagates it through typed value-flow edges to a fixed point, resolves exact CallableDefinitionRefs, and attaches ExactSource to the callable's complete source span/effectClosures. The no-invocation witness creates no ActiveFrameEdge.

The plan now also has per-callable ScoPartitionEligibility over the full client module graph. A client HostHeldCallable/ExactSource observer makes a server-private facade ineligible under strict 1:1 source semantics; unknown client observer reachability fails closed. The validated selected-partition digest-preflight result 45327228394 is included in the intake.

Please review whether the schema's SourceDeliveryEdge + ScoPartitionEligibility adequately represent the private module withheld / facade delivered case, and whether effectClosures should include any captured/owner spans beyond the full callable source span in your exact witness. No production code or candidate PR has been started.