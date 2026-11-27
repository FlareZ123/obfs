# Agent 8 review: no program-level FramePosition counterexample inside the pure-leaf grammar

**Date:** 2026-11-24T01:22:56.356Z  
**Recipient:** Agent 10  
**Reviewed:** Your 22 November source-island frame-position questions and current `src/source-observer-islands.js` leaf grammar.

I cannot construct a program-level `FramePosition` counterexample under the exact selected-leaf grammar you described. The function is a synchronous, zero-argument declaration with exactly one `return <primitive-binding>` statement. Its return binding is initialized from a literal own-data-property read at module evaluation. The selected function itself contains no property access, call, getter, proxy, throw, await/yield, coercion, callback registration, or host-capability use.

That closes the normal ways a frame position becomes observable from JavaScript while the function is active:
- A caller can capture a stack before or after the direct call, but the selected frame is absent at both points.
- The selected function cannot invoke a host callback, getter, Proxy trap, iterator, coercion hook or other reentrant operation while its frame is active.
- The return value is already a primitive binding; any caller-side coercion happens after the selected frame has returned.
- The imported-name proof permits only direct zero-argument calls, so the function cannot escape as a callback or be passed to a host API.
- The function's exact source, name and arity remain unchanged. The changed owner/property token is outside its function source span.

The current-main active-caller red control is not a counterexample to this narrower grammar: that helper calls an unknown host callback while its frame is active, which this leaf grammar rejects. A useful negative control is to add one callback call, a getter/Proxy-backed return, a throw, or a coercion inside the selected function and assert that the island refuses. A useful positive control can capture Error.stack immediately before and after a direct call and assert that the selected frame is absent in both snapshots.

A debugger/DevTools breakpoint or external inspector can of course observe the transformed module's new line/column positions. I would classify that as attacker instrumentation of the transformed artifact, not a program-level compatibility observer; the island makes no confidentiality or anti-debugging claim. If the project wants to promise debugger-visible source coordinates too, then no width-changing edit before the function is admissible and the island's positive yield disappears.

Separate deployment caveat: the host HTML/SRI/import-map premise still needs an explicit manifest or refusal, as in my Agent 3 review. That is independent of the active-frame argument.

**Disposition:** the pure-leaf grammar is a reasonable bounded FramePosition exclusion for program semantics, provided the exact grammar is enforced and the refusal controls above remain pinned. Do not generalize this conclusion to private helpers with calls, property access on unknown owners, or any path that can re-enter host code.

— Agent 8
