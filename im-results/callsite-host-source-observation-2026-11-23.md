# External Node CallSite source observation defeats a direct-call-only source privacy premise

**Status:** focused, intentionally-red compatibility witness; **not** a security result, full-suite integration, or accepted compiler fix.  
**Date:** 23 November 2026. **Author:** Agent 1.  
**Branch:** [`agent1/callsite-source-20261123`](https://github.com/FlareZ123/obfs/tree/agent1/callsite-source-20261123), base `15fa13c306da5ae1fdf0b67e60c5950ad9ba535a`; test commit `eb9f51914c59428aaa202f51ca54f3fe6ab7c4aa`.  
**Reproducer:** `test/callsite-host-source-observation.test.js`.  
**Source-pinned run:** [45126219349](https://github.com/FlareZ123/obfs/actions/runs/45126219349), Ubuntu and Windows Node 22.23.4.

## Finding and trace

A CommonJS source graph contains an ordinary own record and a *nonexported*, direct-call-only helper:

```js
const owner={privateSecret:31};
function readPrivate(){hostCallback();return owner.privateSecret;}
module.exports=readPrivate();
```

The host injects `hostCallback` into the VM context; it is not present in the compiled source graph. The host callback is **sloppy-mode** and uses Node/V8's `Error.prepareStackTrace` structured `CallSite` objects. It obtains the `readPrivate` frame by `getFunctionName()` and observes `String(frame.getFunction())`. Thus the helper is syntactically direct-called and never exported from the input source, yet its exact function body is an externally visible result. This is a real Node host feature, distinct from merely calling `String(readPrivate)` in the input.

`obfuscateFiles` with `properties:true, identifiers:false, strings:false` transforms the own key **once** in each mode, while both native and emitted executions return the same number 31. The host-observed source differs:

| Core mode | Native `readPrivate` property | Emitted observed property | Native/emitted value | Source parity |
| --- | --- | --- | --- | --- |
| COO | `owner.privateSecret` | `owner._p3fe5dc0362` | 31 / 31 | **FAIL** |
| SNO | `owner.privateSecret` | `owner._p086136c0d7` | 31 / 31 | **FAIL** |
| SCO | `owner.privateSecret` | `owner._pe01371b29a` | 31 / 31 | **FAIL** |

Both operating systems reported **three failing source-parity cases and three passing independent private-helper positives** (6 cases per OS). Each negative compiled fixture had `metrics.objects=1, properties=1, bindings=0`; each unobserved positive retained `metrics.properties>=1` and numerical parity. Exact data is printed under `CALLSITE_DIRECT_ONLY` in the workflow logs. Those positive controls prevent mistaking a global zero-rewrite refusal for success.

## A necessary harness correction

The initial test commit used a **strict-mode host callback**. V8 returned `undefined` from `CallSite.getFunction()` even for the native source, so its failed assertions were a harness defect and **not** a compiler counterexample. The corrected callback is constructed in a separate sloppy VM realm; its native stack-frame function is available. The valid two-platform run above demonstrates actual native text and transformed text. Do not cite initial run [45126017514](https://github.com/FlareZ123/obfs/actions/runs/45126017514) as semantic evidence.

## Scope and integration disposition

This is a **local non-strict CommonJS / Node** example with one external callback and source-observable stack inspection. The two-platform test does not establish applicability to strict ESM, real Chromium, networked SCO authorization, SNO filesystem locking, source reconstruction resistance, or performance. V8 hides structured caller functions behind strict stack frames. The compiled-mode labels exercise the shared `obfuscateFiles` source translator; they do not imply three production deployment tests.

**Action for canonical source-observer intake:** A source privacy proof based only on local direct-call-only identifier uses must account for opaque host calls that can inspect caller function objects. A narrow conservative admission rule may reject a proved-local owner's rewrite when a source-containing callable invokes an unproved external callback; any general rule needs a finite host-call/stack capability contract and must preserve positive property rewrites for genuinely private direct-only helpers. This is a research lead, not an implemented or verified solution. Avoid adding a competing compiler PR while Agent 3 owns the canonical intake and Agent 10 owns full-suite acceptance.

The repository-wide **RELEASE-BLOCKED** decision and the `results/` promotion standard remain unchanged.

## Strict JSDoc gate

On the same research branch, `jsconfig.external.json` explicitly includes the witness. [Two-platform focused run 45126680018](https://github.com/FlareZ123/obfs/actions/runs/45126680018) at exact `c4f3d1c53236a691e3ba0edaca012e0833ffaf07` passed the selected established primitive-coercer regression, project JSDoc, external JSDoc (including the new witness), and the paired-budget JSDoc gate on both Ubuntu and Windows. The only changes after the intentionally-red source run were this JSDoc inclusion. This **does not** turn the red semantic parity cases green or constitute full-suite acceptance.

## Source-privacy effect distinction for intake

The counterexample separates **function-value escape** from **caller-stack observability**. A direct-only syntactic use summary constrains where an explicit reference to `readPrivate` flows. It says nothing about whether a synchronous callee can inspect *its caller* through Node/V8 structured stack frames. If callback invocation occurs while a private helper is on the stack, a legitimate host-provided callback can observe that helper without receiving a function argument.

A conservative prospective proof would track this separately from string-coercion sinks. In a non-strict Node scope, a call whose target or host contract is not proved source-inert could mark all active reachable caller functions as potentially source-observed. Owners and keys whose source spelling occurs within those functions, including captured outer records, would then be excluded from rewriting; unrelated private owners should remain eligible. Known safe local call edges could remain provable. This effect propagation would need to be reconciled with interprocedural and cross-file property ownership proof, rather than implemented as a global zero-transformation veto.

The proposed model is a **hypothesis about a conservative admission criterion**, not a demonstration that arbitrary external host callbacks, strict-mode boundaries, patched intrinsics, V8 internals, or hostile debugger instrumentation can be decided statically. Explicit runtime authority and attacker control remain outside the claim.
