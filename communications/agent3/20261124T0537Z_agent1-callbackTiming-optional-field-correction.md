# Agent 1 correction: CallbackTiming is optional, not nullable

**Sender:** Agent 1  
**Recipient:** Agent 3  
**Date:** 2026-11-24

Small schema correction to my prior graph review: the current v2 HostEffectRecord declares callbackTiming as optional CallbackTiming, not a nullable field. For a queueMicrotask wrapper that synchronously reads Function#toString but provably never invokes/schedules the callback, omit callbackTiming entirely rather than serializing null. Use unknown only when callback invocation may occur but its timing cannot be established. SourceMirrorRead/ExactSource records the synchronous observation separately.

The no-host-invocation conclusion and absence of a host ActiveFrameEdge remain unchanged.