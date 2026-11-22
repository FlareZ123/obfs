# Sloppy function source is observable through a preloaded ambient callee

**Agent:** 12. **Date:** 22 November 2026. **Classification:** intermediate negative source-parity counterexample, not a universal impossibility claim.

## Boundary

A JavaScript host can preload a **sloppy-mode** replacement of a writable ambient built-in, such as `Array.isArray`. The replacement can inspect `arguments.callee.caller` to obtain its immediate sloppy caller's function object and invoke `Function.prototype.toString.call(caller)`. Forwarding the original built-in keeps its ordinary return value unchanged. The caller may not itself pass a function object to the host.

This is a legacy V8 caller-reflection behavior, dependent on non-strict JavaScript and host-controlled ambient functions. It must not be generalized to strict ESM functions, all engines, or every callable in the absence of a compatible host hook.

## Reproducible exact source

Frozen proof branch: [`agent12/ambient-caller-source-review-20261122`](https://github.com/FlareZ123/obfs/tree/agent12/ambient-caller-source-review-20261122), source SHA `1beea522a22f118eafeb1a52a3c31e0264fb960c`, based on the independently green Promise-callback preview head `d527f5fc3cdeb6b32054a39e41c552e07829a505`. Focused test: `test/ambient-caller-source-preloader-review.test.js`.

Host prelude:

```js
const nativeIsArray=Array.isArray;
Array.isArray=function observedIsArray(value){
  const caller=arguments.callee.caller;
  if(caller&&caller.name==="privateWorker")
    globalThis.observed=Function.prototype.toString.call(caller);
  return nativeIsArray(value);
};
```

The source includes `function privateWorker(){ const owner={secretField:17}; ... const yes=Array.isArray([1,2]); ... }` and an unrelated top-level local record. `privateWorker` itself is a direct-call-only lexical function, so the experimental `collectPrivateDirectCallables` treats its body as private. The hostile host can still inspect that body's exact source when `Array.isArray` is invoked.

[Run 44993580713](https://github.com/FlareZ123/obfs/actions/runs/44993580713) executed Node 22.23.4 focused tests on Ubuntu and Windows. **Each OS: 1 native control passes; 3 transformation source-parity checks fail**, one for each mode COO, SNO and SCO. In every mode, emitted `metrics.properties === 2`, native program returns 21, emitted program also returns 21, and the observed worker function source changes from `secretField` to a mangled private field spelling. This is a direct ordinary-value-equal, source-unequal counterexample.

The test uses preloaded code and transformed CommonJS source inside a Node `vm` realm. It does not claim execution on real Chromium or an SCO HTTP production path. The candidate is an experimental non-mainline integration branch; this result does not establish that mainline or other branches share its exact source-exposure policy.

## Decision implications

The security model explicitly allows an adversary-controlled host, so a source-proof for sloppy lexical functions cannot assume that a call to a replaceable host method is opaque merely because the function object is not itself exported. The prior Promise callback fix closes one source-observation path and **does not** close this caller-reflection path.

A sound future guard must account for sloppy caller disclosure across ambient host call edges (and potentially other host callbacks/getters) while retaining genuinely private property-rewrite yield. A coarse refusal for all sloppy functions containing calls is a valid conservative starting point to test, but could block substantial protected work and does not by itself prove the full higher-order effect boundary. Strict-function treatment, cross-file imported callee effects, native/host monkeypatches, and output/runtime performance require separate validation.

Do not integrate an unqualified private-function source assumption based solely on direct lexical call-site counting. Keep source-exposed callable tests on a single frozen integration candidate and require positive private-work yield in the same held-out corpus.
