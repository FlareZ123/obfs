# Externally supplied sloppy caller inspector observes a private worker's source

**Status:** intermediate, source-pinned Node 22 compatibility **counterexample** on current main and the optional source-preservation draft. 22 November 2026. This is **not** an adversarial security-strength result.

## Tested contract and source

The supplied CommonJS module defines a worker that is only called directly and is never exported as a function:

```js
function worker(){
  const localSecret=17;
  return [external(),localSecret];
}
module.exports=worker();
```

Before evaluating native and transformed variants in the **same** VM realm configuration, the test host defines an *external* non-strict function:

```js
function external(){
  return String(external.caller).includes("localSecret");
}
```

Here `external.caller` is a supported legacy sloppy-function reflection channel in the tested Node/V8 engine. It provides a reference to the currently executing `worker` even though the application does not export that function or call any source-observation API in the supplied code. `String(external.caller)` reveals the source of `worker` and the spelling `localSecret`.

Original result: `[true,17]`. Emitted result: `[false,17]`. The compiler changed the worker's local to `_vc81372c974c7`; its numeric return remained 17. An otherwise equivalent positive control replacing `external()` with `1` still renames its private local and preserves `[1,17]`.

## Reproduction pins

- **Current main:** base commit `8594e7af0f88f7abdfe4fbaf769fdaeb3d392353`; test-only branch `agent6/main-promise-host-callback-observer-20261122` at `35004c35d74efac6ccd38fb004eb6af9901852a9`. [Focused Linux and Windows run 45080349921](https://github.com/FlareZ123/obfs/actions/runs/45080349921) failed the parity test on **both** platforms and passed the positive rename-yield test.
- **Optional canonical source guard draft #299:** baseline `b826c10e3c59c2210c00448a0645bb8751a87758`; peer branch `agent6/peer-agent3-caller-source-20261122` at `18dcb1039d59c0a8794bc2aa10d08bdb86c0cbe1` with two unrelated JSDoc type fixes. [Focused Linux and Windows run 45080277508](https://github.com/FlareZ123/obfs/actions/runs/45080277508) failed the same semantic parity assertion on **both** platforms and passed the independent positive control.
- The earlier [sloppy `observer.caller` same-file control 45079308539](https://github.com/FlareZ123/obfs/actions/runs/45079308539) **passed** with explicit zero renamed owners for a visibly source-observing inner function, while an unrelated private worker retained positive yield. This independent control shows that the issue concerns an observer supplied *outside the analyzed graph*, not all uses of legacy `.caller`.

The test is scoped to non-strict **CommonJS** behavior on Node 22. The legacy `.caller` accessor may be restricted or throw for strict functions, including ESM; no browser universality is claimed.

## Implication

Lexical direct-call-only use is insufficient to establish that a worker's source cannot be inspected when that worker invokes an unowned external function in a sloppy runtime. A host can inspect the calling worker without receiving it as an ordinary JavaScript argument.

A conservative source-preserving compiler must identify the external-call trust boundary and decline source-changing edits in the vulnerable caller unless a stronger proof of callee behavior or restricted runtime applies. An isolated direct-call helper that never invokes an unproved external observer can still be renamed, as the positive control demonstrates.

This case is separate from the [mutable Promise continuation callback](promise-continuation-host-source-observation-2026-11-22.md), which exposed callback source through an externally replaced method. Both demonstrate the need for explicit host assumptions in source-preservation proofs. No corrective implementation is merged; Agent3 owns canonical cross-pass integration. Overall strong-protection release remains **RELEASE-BLOCKED**.

## Independent real Node `require()` baseline, separate OS processes

The VM-based CommonJS compatibility case above is corroborated by an actual Node.js module-loader experiment. The test creates three isolated `.cjs` files in a temporary directory using atomic filesystem writes: unmodified `native.cjs`, generated `compiled.cjs`, and a host `host.cjs`. The host defines the same sloppy `globalThis.external` source observer before calling `require('./native.cjs')` or `require('./compiled.cjs')` in **separate Node subprocesses**, keeping the host configuration identical.

On the current-main test-only branch `agent6/main-promise-host-callback-observer-20261122` at `2034aa0b3a2bb4f549ca13020e51c9900610b282`, the fixture is `test/private-external-caller-real-cjs.test.js`. [Focused Ubuntu and Windows run 45080993386](https://github.com/FlareZ123/obfs/actions/runs/45080993386) failed the same parity assertion on **both** operating systems, with original process `[true,17]` and generated process `[false,17]`; the generated worker's private local was renamed to `_vfa4c24043e82`. A second test explicitly checked that a separate harmless private direct-call helper still earns a positive identifier-renaming count. The trace therefore does **not** depend on `vm.runInNewContext` or an approximation to Node's CommonJS wrapper.

This pin strengthens the claim to actual Node 22 `require()` behavior for nonstrict CommonJS files in the tested runners. It remains scoped: a strict function can restrict `.caller`, and alternate runtimes may differ. It makes no new claim about source confidentiality, tamper-resistant execution, or the 2.5× budget.
