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

## Follow-up: a plain property getter defeats call-only gating

A preview guard at `agent12/ambient-caller-conservative-fix-20261122`, source `e417520e28d955a69e6b793fbf6f8a136cdb44c3`, marks a sloppy direct-called function with any explicit call/new/tagged-template/import expression as source-exposed. It passes the original four-test caller witness and maintains one unrelated private-property rename on both Ubuntu and Windows, including both JSDoc gates: [run 44993783920](https://github.com/FlareZ123/obfs/actions/runs/44993783920). **This is only a partial experimental guard.**

A caller can leak without an explicit call syntax in its own body. A host preloads `Object.defineProperty(globalThis,'hostNumber',{get:function(){const f=arguments.callee.caller;...;return 1;}})`, then a sloppy lexical worker reads `globalThis.hostNumber` as a plain member expression. In the same context, the getter sees its caller's original `Function#toString` while ordinary results remain 21. The call-only guard does not detect this implicit user-code invocation; it still mangles an internal private property.

Exact source [`agent12/ambient-getter-source-review-20261122`](https://github.com/FlareZ123/obfs/tree/agent12/ambient-getter-source-review-20261122), SHA `12bf9ded92088b38a896bc53ed88373fdddf17a2`, test `test/ambient-getter-source-preloader-review.test.js`. [Two-platform run 44993910482](https://github.com/FlareZ123/obfs/actions/runs/44993910482): each OS has **1 native control pass and 3 mode-specific source-parity failures**; per-mode property metrics remain **2**. This is a counterexample to regarding a CallExpression-only effect test as a complete solution.

A stronger source-safe proof must treat reads of opaque or host-controlled objects as possible accessor invocations and account for implicit coercion, proxies, and other user-code effects. Exemptions for proven own data properties need a sound ownership and alias proof, rather than blanket refusal of all member expressions. These distinctions matter to retaining protected-work yield under strict source parity.

## Authentic Node CommonJS wrapper disclosure

The earlier isolated `vm` witnesses observe a named private worker. The corresponding source-disclosure hazard also applies to the **actual Node CommonJS loader wrapper** when the top-level module uses a replaceable ambient API. Node wraps a CommonJS file in a sloppy function of the form:

```js
function (exports, require, module, __filename, __dirname) {
  /* supplied file source */
}
```

In the independent test, an external preloader replaces `Array.isArray` with a sloppy wrapper that captures its immediate caller, locates the module wrapper by a harmless source marker, records `Function#toString` of the wrapper, then invokes native `Array.isArray`. The module's ordinary exported numeric value remains 21 in both source versions.

Frozen source [`agent12/real-cjs-wrapper-preloader-review-20261122`](https://github.com/FlareZ123/obfs/tree/agent12/real-cjs-wrapper-preloader-review-20261122) at `9e4a671a6715713f920407af737fe7fd788097ac`; test `test/cjs-wrapper-host-preloader-review.test.js` uses `atomicWrite` to create a real temporary launcher and module, then `spawnSync` to run a fresh Node CommonJS loader. [Focused run 44994167245](https://github.com/FlareZ123/obfs/actions/runs/44994167245) at Node 22.23.4 is **1 native pass / 3 COO/SNO/SCO source-parity failures** on each of Ubuntu and Windows. The emitted wrapper's contents include two rewritten private fields (`metrics.properties:2`), while the native wrapper exposes `secretField` and `otherField`. This is independent of whether a private lexical function inside the module is directly called.

**Important limitation:** the test covers non-strict CommonJS whose top-level execution calls a monkeypatchable built-in. It does not establish the same legacy `.caller` exposure in strict code, ESM, or every engine. It does show that preserving exact source only for locally classified `FunctionDeclaration` nodes is insufficient for these host scenarios: the loader itself contributes an externally observable enclosing function body that includes the entire file. An ordinary bundler or minifier that changes that source would likewise fail an unrestricted byte-level `Function#toString` parity requirement under the same hostile preloader.

The existing partial call-expression guard for private lexical functions does **not** address changes elsewhere in a CommonJS module's source when its enclosing loader wrapper is observed. Do not promote this guard without an explicit, externally reviewed definition of which host observations belong in the supported semantic contract.

## Real Chromium browser confirmation

A separate integration test uses a local HTTP server and actual headless Chromium with two parser-blocking classic scripts. The first preloads a non-strict `Array.isArray` wrapper which records `Function#toString` of its named sloppy caller; the second loads the native or obfuscated `entry.cjs` as a classic script with an explicit `window.module` stub. It observes the result in the DOM. The target code is compiled using COO `sourceType:'commonjs'` to enable the private-property optimizer, and run as a browser classic script; this is a documented hybrid packaging configuration, not an ESM bundle.

Frozen branch [`agent12/sloppy-caller-real-browser-20261122`](https://github.com/FlareZ123/obfs/tree/agent12/sloppy-caller-real-browser-20261122), SHA `587e623f5fcc25103671f4343fa6958a8a79ae62`, file `test/ambient-caller-source-real-browser.test.js`. [Focused run 44994324254](https://github.com/FlareZ123/obfs/actions/runs/44994324254) executed native and emitted HTTP-served scripts in Ubuntu's real Chromium and reproduced the source-parity mismatch: both returned `21`, emitted code had two private property rewrites, and the ambient wrapper recorded `owner.secretField` versus `owner._pc4931f2f31` in the worker source. The browser-focused assertion fails as intended. Windows CI does not carry a pinned Chrome binary, so its corresponding test deliberately skips the Chromium path; the earlier Node-V8 source tests have direct Windows evidence.

This additional browser observation strengthens the empirical platform coverage of the **sloppy caller** case, while leaving strict ESM and complete environmental fidelity unresolved.

## Explicit strict-mode positive control with original host preloader

A paired authentic Node CommonJS proof starts the target file with a valid `'use strict';` directive while keeping the *same* preloaded sloppy `Array.isArray` wrapper. In the tested V8 legacy semantics, the host's `arguments.callee.caller` is null for the strict module wrapper, so the wrapper cannot obtain the target file's source through this specific channel. The original and transformed programs each return `{value:21,source:''}`. The property optimizer still rewrites **two** private own keys in each of COO, SNO and SCO, showing positive protected-work yield under the precisely bounded observation channel.

Source [`test/cjs-strict-host-caller-positive.test.js`](https://github.com/FlareZ123/obfs/blob/af3c7e59f4455eeeb725807673e453bc7c384dbb/test/cjs-strict-host-caller-positive.test.js), pinned branch SHA `af3c7e59f4455eeeb725807673e453bc7c384dbb`; [Ubuntu and Windows focused run 44994606125](https://github.com/FlareZ123/obfs/actions/runs/44994606125) has **4/4 green per OS** and passes both JSDoc gates. This is intentionally a positive control for *legacy caller observation only*. It does not prove that strict CommonJS source cannot be inspected by other mechanisms, including a modified module loader.
