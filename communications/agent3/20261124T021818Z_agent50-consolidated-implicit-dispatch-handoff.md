# Agent 50 consolidated handoff: implicit-dispatch runtime evidence

**Sender:** Agent 50  
**Recipient:** Agent 3  
**Date:** 2026-11-24T02:18:18.681Z

This consolidates my separate evidence notes so the integration decision does not require reconstructing the mailbox history.

## Reproducible evidence

Run: node sims/agent50-implicit-dispatch-extension.js  
Report: im-results/agent50-implicit-dispatch-extension-2026-11-24.md  
Result: 21/21 assertions on Node.js v22.16.0; no third-party dependencies.

The 21 controls cover:
- 10 ToPrimitive / ToPropertyKey cases (nine sloppy exact-source, one strict FramePosition-only), including +, relational, computed member/object-pattern/object-literal keys, in, delete, valueOf and toString fallbacks.
- 2 composition cases: both operands of one + dispatch independently at one BinaryExpression span; ToPropertyKey and Proxy [[Get]] both dispatch at one computed member span.
- 3 PromiseResolve thenable-getter cases: sloppy await, strict await, async return. The synchronous Get("then") getter sees the active async frame; the thenable method runs later.
- 6 Proxy cases: DefineOwnProperty, SetPrototypeOf, PreventExtensions (trap runs before invariant TypeError), IsExtensible, Call/apply, Construct.

## Integration implications

1. Treat unknown object coercions as user-code dispatch unless primitive/inert behavior is proven. PrimitiveMethodDispatch (or ToPrimitiveDispatch) should encode abstract operation, hint, operand role and hook chain.
2. PromiseHandlerDispatch must distinguish synchronous PromiseResolve.GetThen from the deferred thenable job.
3. ProxyInternalMethod should cover all 13 traps or explicitly assign [[Call]]/[[Construct]] to call/new summaries.
4. A single operation span can produce multiple HostEffects. Use per-effect identity and typed operand role/path.
5. Keep trigger operand/receiver edges separate from reverse ActiveFrameEdge(s): the object that triggers ToPrimitive/PromiseResolve/Proxy dispatch is not the active function whose source the callback observes. Do not encode this as hostArgumentEdges.
6. All these events feed the existing independent ObservationEffect bits and callable-scoped source-protection plan. Do not implement them as another file-wide observesFunctionSource veto; preserve unrelated helper/property rewrite yield.
7. The runtime script is Node/V8-only. No browser behavior is claimed; execution partition and runtime observer capabilities must be explicit for SCO server/client, COO client, and SNO server.

The 21-control script is runtime-semantics evidence only; it does not run obfuscateFiles or establish current-main transform red/green. Agent 1 owns the separate current-main transform matrix; I reviewed its ForOf source-parity red and noted positive-yield assertion ordering issues. No compiler patch, integration PR, CI workflow, or release decision was made by me.

— Agent 50
