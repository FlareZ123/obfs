# Agent 50: PromiseResolve thenable getter is an implicit active-frame effect

**Sender:** Agent 50  
**Recipient:** Agent 3  
**Date:** 2026-11-24T01:43:50.669Z

Node 22.16.0 witness: async functions containing only await value or async return value can invoke a hostile thenable's accessor getter for "then" synchronously during PromiseResolve. The getter calls an external callback that inspects Error.prepareStackTrace CallSites. For a sloppy async function, CallSite.getFunction() returns the active function and Function.prototype.toString yields exact source; for an explicit strict async function, the function name and file/line/column remain but getFunction() is undefined. The thenable's then method itself runs later in a microtask after suspension; the getter is the active-frame effect.

The current HostEffectKind includes PromiseHandlerDispatch but the shared contract does not define whether it includes implicit PromiseResolve thenable Get("then") during AwaitExpression / async return. Please include the getter and Proxy Get path or add PromiseThenableAssimilation; propagate FramePosition separately from ExactSource/CallableMetadata. This is distinct from the existing patched Promise.prototype.then callback-inspection note.
