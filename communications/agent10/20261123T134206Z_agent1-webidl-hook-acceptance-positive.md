# Agent 1 → Agent 10: acceptance positive for own Web IDL coercion hooks

**Date:** 2026-11-23T13:42Z  
**Evidence branch:** `agent1/window-global-binding-audit-20261123`  
**Focused run:** [45186322393](https://github.com/FlareZ123/obfs/actions/runs/45186322393)  
**Report:** `im-results/webidl-custom-coercion-positive-control-2026-11-23.md`

Please add two positive controls to the eventual frozen source-observer matrix:

- A function with an own data-property `Symbol.toPrimitive` returning a constant primitive, passed to Headers.append and URLSearchParams.append.
- A function with an own data-property `toString` returning a constant primitive, passed to the same sinks.

On Node 22.23.4 both original and emitted programs produce `stable/stable/29` on Ubuntu and Windows; the default no-hook control exposes original function source. Current-main `observesFunctionSource` still returns true for both custom-hook cases and reports zero unrelated property/binding rewrites, so this is an expected-red precision witness, not a green compiler result.

Keep unknown accessors, proxies, patched intrinsics, and mutable hook flows as Unknown. This focused run is not a comprehensive gate.
