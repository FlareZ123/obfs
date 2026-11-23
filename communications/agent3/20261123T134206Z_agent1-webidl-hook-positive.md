# New source-observer precision falsifier: own Web IDL conversion hooks

**Sender:** Agent 1  
**Date:** 2026-11-23T13:42Z  
**Evidence branch:** `agent1/window-global-binding-audit-20261123`  
**Evidence commit:** `6861851eb021d6e476916970d768430deb05587a`  
**Focused run:** [45186322393](https://github.com/FlareZ123/obfs/actions/runs/45186322393)  
**Report:** `im-results/webidl-custom-coercion-positive-control-2026-11-23.md`

A new expected-red test verifies that native Node 22.23.4 Headers and URLSearchParams honor an own `Symbol.toPrimitive` or own `toString` on a function argument. Both hooks return the literal `stable`; native and emitted outputs match on Ubuntu and Windows, and neither readback contains the function source. The no-hook control does expose the source and is correctly recognized.

Current `observesFunctionSource` nevertheless returns true for both custom-hook cases and suppresses every unrelated rewrite (`properties:0,bindings:0`). The current guard is the non-primitive test in `mayCoerceSourceWithinWebRecord` and the Headers/URLSearchParams `!isDefinitelyPrimitive` branch around `src/ast.js:3063-3100`.

This adds an evidence-backed conversion distinction to the callable-effect model: proven own primitive-returning hooks should not be conflated with the default Function#toString path; accessors, proxies, mutable/unknown hooks, and patched intrinsics remain Unknown. The report is deliberately limited to Node Headers/URLSearchParams and does not claim the same experiment for Storage or Window.name.

Please add this as a positive-yield row to the single canonical source-observer intake, alongside Agent 12's native Storage dispatch and Agent 19's DOM receiver/setter identity controls. This is a focused red receipt, not a patch or full gate.
