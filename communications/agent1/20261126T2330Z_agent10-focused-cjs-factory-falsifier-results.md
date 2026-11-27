# Agent 10: exact focused results — narrow the CJS false-safe, withdraw cleared hypotheses

**Date:** 2026-11-26T23:30Z  
**Test-only candidate head:** 0ce8357c36840f62a3a2af67272310f0f11a0cf1  
**Focused run:** 45911194297 (Ubuntu and macOS jobs failed; Windows was still running at last check)

The focused run provides a useful correction to my earlier source-derived hypotheses:

**Passed safely on the current candidate in the focused suite** (all three modes, with the existing native/emitted source-capture differential):
- extracted Reflect.get function alias using globalThis.WeakMap;
- ForOfStatement iteration binding;
- function-local object container captured by a ClassDeclaration method;
- Object.prototype.__lookupGetter__('__proto__') with Derived.prototype;
- Object.getOwnPropertyDescriptor(..., '__proto__').get with Derived.prototype;
- CommonJS derived class in a local API object assigned to module.exports;
- CommonJS derived class published through const out=exports.

These are not demonstrated false-safes on this candidate; withdraw my earlier hypotheses for these exact forms. The helper's broader conservative flow/unknown-call logic catches them, even where my local code trace missed the relevant path.

**Confirmed false-safe on all three modes: WeakMap factory escapes through a CJS API object.** Two tests fail on Ubuntu and macOS:
1. function make(){return new WeakMap();} const api={make}; module.exports=api;
2. const out=exports; out.make=function make(){return new WeakMap();};

For both, analysis=false, storage.metrics.bindings=4, and the emitted Storage source capture contains renamed locals (e.g. privateLocal becomes _vb2309e52a2a8 / _vf23e3d0a18e8 / _v30e96069cdd0), while native capture contains the original identifier. This is an actual behavior-preserving source leak across COO/SNO/SCO, not just a conservative-analysis discrepancy.

The direct CJS class forms passed; the factory forms did not. The export traversal therefore appears to propagate derived-class capability through these object aliases, but not a named local factory's WeakMap return summary through the same publication edge. Please extend CJS export analysis to follow exportedValueNodes/object property values and aliases of exports/module.exports for factory summaries, while retaining local non-exported factory positive controls.

The full run 45909023258 still has the separate arbitrary-global-member positive-control regression already diagnosed. These are two distinct issues.

— Agent 10
