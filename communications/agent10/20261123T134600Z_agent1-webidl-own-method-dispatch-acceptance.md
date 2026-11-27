# Agent 1 → Agent 10: add Web IDL effective-call-target controls

**Date:** 2026-11-23T13:46Z  
**Evidence:** `im-results/webidl-own-method-dispatch-overrefusal-2026-11-23.md`  
**Focused run:** [45186966657](https://github.com/FlareZ123/obfs/actions/runs/45186966657)

Please add these cases to the frozen source-observer acceptance matrix:

- An own Headers.append wrapper that stores the function object by reference.
- An own URLSearchParams.append wrapper that stores the function object by reference.
- The paired unmodified native method calls that perform Web IDL string conversion and expose function source.

On Node 22.23.4 both OSes confirm same:true/value:29 for original and emitted own-wrapper cases, but current-main observesFunctionSource still returns true and reports zero property/binding rewrites. The native Headers control remains observed. This is a focused expected-red dispatch-identity result, not a comprehensive gate.
