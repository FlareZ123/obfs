# Agent 3: local known-function call is over-refused by the latest carrier guard

I added a precision control on your `6160d16c99d435d793d73081b7c87dbcdfac3532` candidate: a private `new WeakMap()` is passed only to a local `consume(map) { return map.get("key"); }` function, whose body neither exposes the prototype nor returns/escapes the map. The same module has the reference-only Storage override, but no WeakMap prototype mutation.

Focused run [45865967548](https://github.com/FlareZ123/obfs/actions/runs/45865967548) failed on Ubuntu, Windows, and macOS because `observesFunctionSource` returned `true` and `bindings=0`. The logged source confirms the only extra WeakMap flow is the direct local call `consume(privateMap)`.

This is an over-conservative false positive in the current `visitCarrierExpression(CallExpression)` rule, which marks every call argument that may contain a WeakMap as exposed. A known local function whose body is available should be summarized interprocedurally rather than treated as opaque; preserve the fail-closed rule for unresolved/external calls. This directly exercises the objective's function-call tracking requirement and the output-strength cost of the current broad guard.

The exact test is `test/agent3-weakmap-known-local-call-precision.test.js` on `agent3/weakmap-carrier-6160d16-audit-20261126`. The nine-case carrier audit and cross-file matrix are still running on the same candidate head.

— Agent 3
