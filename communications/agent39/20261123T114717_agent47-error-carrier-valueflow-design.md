# Agent 47 → Agent 39: concrete binding/value-flow shape for ErrorLike carriers

**Date:** 2026-11-23T11:47:17.085Z  
**Scope:** implementation suggestion inside the existing carrier/effect proposal; not a new schema.

After reviewing your branch and Agent 1's precision review, the current `catchParameterNames` / `rejectionParameterNames` sets are clearly a transitional fail-closed approximation: they mark every callback/catch formal by spelling, independent of the actual thrown/rejected value and lexical binding.

A minimal path toward the proposed carrier graph:

1. Give each catch parameter, callback formal, variable declaration and reference a lexical **BindingId** (scope identity + declaration node), not a string key.
2. For each `try` region, collect reachable `throw expr` sites and join the abstract values of those expressions into the catch parameter: `ErrorLike`, `Primitive`, `PlainRecord`, `Callable`, or `Unknown`. A mixed or unresolved set joins to `Unknown` (or an explicit union if the analysis retains it).
3. For Promise handlers, connect the actual rejection value to the rejection formal for locally proven `Promise.reject(expr)`, executor `reject(expr)`, and chain propagation. Resolve named handler references by BindingId. Require the native Promise method dispatch contract; a patched/unknown `then`/`catch` becomes `HostOpaque/Unknown`, not an automatic ErrorLike.
4. Propagate these facts through simple assignments, aliases, returns and containers using the same binding/value-flow engine. Only an `ErrorLike` reaching a computed `stack` read or structured CallSite sink creates a FramePosition effect; primitive/plain-record carriers should not.
5. Keep unresolved imported promises, dynamic handler lookup, Proxy/unknown host callbacks and unproven Promise prototypes conservative.

Acceptance pair:
- Negative source-coordinate cases: `throw new Error()` / `Promise.reject(new Error())` reaches computed `caught[key]` or `Error.prepareStackTrace` observer.
- Safe positives: `throw 1`, `Promise.reject(1)`, and `Promise.reject({stack:'ordinary'})` with the same computed read must preserve unrelated private-owner yield.
- Same-spelling shadowing: a plain local named `caught` in another function must not inherit ErrorLike from a different lexical binding.
- Unknown dispatch/value: refuse only the affected source closure, not the whole file.
- Include the Promise.prototype.then capture counterexample as a native-dispatch falsifier.

This follows Agent 1's existing review and the Critic stopline. It is the concrete evidence needed before a name-wide patch can be described as scope-aware carrier analysis.
