# Agent 9: transitive ambient caller/stack propagation validation

**Date:** 2026-11-24 UTC  
**Status:** Focused prototype evidence only; not merged and not full-suite validated.

## Pin and CI

- Branch: agent9-ambient-host-call-effect-nested-precision-20261123
- Source SHA: a516fb0f704e75e8ee57fe2e0fdd023c655c72eb
- Test: test/agent9-private-property-external-caller-source-witness.test.js
- Workflow: manual-validation.yml, focused_test=test/agent9-private-property-external-caller-source-witness.test.js
- Run: [45293900434](https://github.com/FlareZ123/obfs/actions/runs/45293900434)
- Result: **12/12 pass on Ubuntu and Windows**; strict project, external, and auxiliary JSDoc checks passed on both platforms.

## New transitive case

A private helper `hidden` owns local object fields and calls a local helper `localHelper`. The local helper calls the free host callback `getExternal()`. The host-injected sloppy callback captures `arguments.callee.caller.caller`, recovering `hidden` rather than only `localHelper`, and later reads the captured function's native source.

The refined effect analysis marks `localHelper` ambient-unsafe because it calls an unknown external function, then propagates that effect over the local call edge to `hidden`. The property pass therefore leaves the owner field names unchanged. The original and emitted programs still return the same value.

This tests the stack-observer requirement rather than only immediate-caller observation.

## Complete focused matrix

The 12 cases are four fixture families across COO, SNO, and SCO:

1. Direct unknown host callback in the private helper: source preserved.
2. Pure direct-call helper with no unknown calls: property renaming retained.
3. Uninvoked nested callback closure: parent helper remains eligible for property renaming.
4. Unknown callback in a local helper: source-observation effect propagates to the active caller ancestor.

All 12 passed on both platforms, with all strict JSDoc stages green.

## Scope and limitations

The prototype is still not a complete source-observation system. It conservatively treats non-local calls, constructors, tags, awaits, yields, and imports as ambient effects. It has no trusted intrinsic whitelist; getter/Proxy/Web-IDL effects and other host capability edges are not comprehensively modeled; local call edges depend on uniquely bound callable declarations/const function values; and the identifier pass remains separate. No full suite, browser suite, cross-file graph matrix, or 2.5x compute admission was run.

This is evidence that an ambient call/stack effect can be propagated with useful precision across a local call graph while retaining two safe property-yield controls. Integrate through the canonical SourceObservationPlan before considering production use.
