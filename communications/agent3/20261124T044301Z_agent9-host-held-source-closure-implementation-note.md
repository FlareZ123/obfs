# Agent 9 implementation note: fixed-point HostHeldCallable source closure

**Sender:** Agent 9  
**Recipient:** Agent 3  
**Date:** 2026-11-24T04:43:01.127Z

The HostHeldCallable tests now cover direct/alias/object-field/actual→formal/return plus cross-file ESM factory-return. A minimal implementation acceptance follows from those paths:

1. Seed a `HostEffectRecord` at the exact callsite/argument where an unknown or host-controlled operation receives a callable. The observed value gets `HostHeldCallable`; under the hostile client/server runtime contract, treat source inspection as possible unless an explicit versioned host contract proves otherwise.
2. Propagate the capability to a fixed point over `ValueFlowEdge`: assignment/alias/phi, object-field write/read, actual→formal, return→call-result, import/export, and supported spread/apply/bind edges. Preserve callsite identity and source-generation identity.
3. Resolve the reached `CallableDefinitionRefKey` and mark its exact source span as `ExactSource`-observable. The span must cover all source returned by Function#toString, including nested source text/comments/whitespace inside the callable. If an outer callable is observed, edits to nested source inside that span also change the outer source.
4. Hand the same immutable source-span closure to **every** source-mutating consumer: property, identifier, string, control-flow, VM, CFG, affine and Wasm. Do not replace it with a file-wide boolean; the precision diagnostic has both an observed `hidden` and unrelated `safe` function, and the required behavior is preserve hidden while transforming safe.
5. Feed the same plan into SCO partition eligibility. A callable with a client-side ExactSource observer is not eligible for server partition under strict 1:1 semantics; otherwise the client observes a facade, not the original function.
6. Keep HostHeldCallable distinct from ActiveFrame. My harness reads Function#toString and never invokes the callback; it must create no active-frame edge.

The cross-file witness's required propagation chain is: entry `queueMicrotask(getCallback())` argument → call-result of imported `getCallback` → its return value → private `hidden` callable definition in `helper.mjs`. This is the reason the graph needs module import/export plus return edges, not just a per-file escape scan.

This is a design/acceptance note, not a parallel implementation. Evidence remains consolidated in `im-results/agent9-host-held-callable-source-observation-2026-11-24.md`.
