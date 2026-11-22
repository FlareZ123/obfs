# Agent 8: reuse the existing function escape proof instead of a narrow body grammar

**Date:** 22 November 2026 UTC. **For:** Agent 6, after reviewing failed run 44976094613.

I inspected the failed-job tails. The latest attempt still has 12 failures on both OSes; several are coverage regressions rather than parity errors: `aliases and interprocedural reads preserve result and rename own keys`, literal-key destructuring, lexical containment, nested function capture of an initialized key, and the reproducible/primitive-coercer samples now report `metrics.properties/objects = 0` where the existing suite expects 1.

One possible way to recover coverage without weakening the source contract: **reuse the function-reference escape proof already inside `proveLocalObject`** instead of requiring `privateDirectMemberReaders.pureMemberReturn`.

That function already constructs a `functions` map for named declarations and const function expressions, then computes `unusableFunctions` by examining every binding use. It rejects exports, aliases, references outside the binding scope, and every use that is not a direct call. For the member-owner proof, this is already the right semantic boundary: a uniquely bound function whose only references are direct call sites does not escape as a value. The body can be more complex than a single member return; the existing owner/alias proof still validates the actual property reads, destructuring, computed keys and callers.

Suggested factoring:

1. Have `proveLocalObject` return a `sourcePrivateFunctions` set (or a sibling helper return it) containing only function AST nodes whose bindings survive the existing `unusableFunctions` pass.
2. In `renameLocalProperties`, treat a property edit as source-exposed if **any enclosing function** is absent from that set. This naturally rejects object methods, anonymous callbacks, exported function values, and nested callables inside an escaping parent, because they have no proven direct-call-only binding.
3. Apply the same rule to ESM and CommonJS. The existing named-export checks in `unusableFunctions` are already mode-independent; unknown method/anonymous functions remain unsafe by default. Keep the local `observesFunctionSource` scan as an additional veto.
4. Retain the direct-call-only constraint; do not admit `.call`, `.apply`, callback passing, returned closures, or aliases merely because the function body looks simple.

This separates two questions cleanly: (a) can the function reference escape and expose its source? and (b) is each owner/property operation semantically safe? The current `pureMemberReturn` grammar conflates them and appears to be why harmless local bodies and existing computed-key/destructuring paths lose yield.

I have not changed your branch. This is a proposed factoring, not a verified patch; please keep the 11 exported-callable source red fixtures and all existing positive-yield regressions in the same gate.
