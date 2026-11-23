# External Node CallSite source observation defeats a direct-call-only source privacy premise

**Status:** focused, intentionally-red compatibility witness; **not** a security result, full-suite integration, or accepted compiler fix.  
**Date:** 23 November 2026. **Author:** Agent 1.  
**Branch:** [`agent1/callsite-source-20261123`](https://github.com/FlareZ123/obfs/tree/agent1/callsite-source-20261123), base `15fa13c306da5ae1fdf0b67e60c5950ad9ba535a`; test commit `eb9f51914c59428aaa202f51ca54f3fe6ab7c4aa`.  
**Reproducer:** `test/callsite-host-source-observation.test.js`.  
**Source-pinned run:** [45126219349](https://github.com/FlareZ123/obfs/actions/runs/45126219349), Ubuntu and Windows Node 22.23.4.


## Current synthesis and decision (read first)

The regression disproves the **direct-call-only implies function source is unobservable** assumption **in non-strict Node CommonJS when a legitimate host callback is invoked**. A host may inspect the private caller via V8 structured `CallSite.getFunction()` or the deprecated sloppy `Function.caller`; no explicit function-reference escape is required. Unmodified SCO/COO/SNO core transforms the source-visible own field but retains numerical31. Its **real SNO launcher** also executes under a valid SHA-256 manifest while showing that source mismatch. This is a compatibility result, not a successful tamper or integrity bypass.

The final source-paired regression corpus contains **30 cases with identical test file bytes on all four compared source-observer branches**, Git blob `605d1593249de0d2af1e98be9416ceb564678aab`. It covers direct callbacks, aliases, transitive helpers, dynamic members, real SNO loading, strict-frame controls, a same-graph unrelated positive, esbuild, legacy caller, object getter, and ambient global getter. The source-paired baseline and bounded experimental results, verified on Ubuntu and Windows, are:

| Variant | Confirmed pass | Confirmed red | Critical disposition |
| --- | ---: | ---: | --- |
| Unmodified compiler [45131200809](https://github.com/FlareZ123/obfs/actions/runs/45131200809) | 7/30 | 23/30 | Rewrites observable caller fields |
| Direct unbound-call donor (21-case [45129010969](https://github.com/FlareZ123/obfs/actions/runs/45129010969)) | 12/21 | 9/21 | Alias/member/transitive caller paths defeat it |
| Transitive explicit-call donor [45131205755](https://github.com/FlareZ123/obfs/actions/runs/45131205755) | 24/30 | 6/30 | Implicit object/global accessor callbacks defeat it |
| Reachable-call-scoped donor [45132521287](https://github.com/FlareZ123/obfs/actions/runs/45132521287) | 24/30 | 6/30 | Restores 9/9 nested positives [45132516162](https://github.com/FlareZ123/obfs/actions/runs/45132516162); implicit observer failures remain |

All highlighted early improvements reproduced on Windows and Ubuntu at their referenced two-platform pins. A new source-paired **precision** matrix shows the transitive donor also overrefuses safe private rewrites: three never-called nested callbacks × three modes, [baseline 45132138220](https://github.com/FlareZ123/obfs/actions/runs/45132138220) **9/9 green** versus [donor 45132143552](https://github.com/FlareZ123/obfs/actions/runs/45132143552) **0/9 green**, despite correct numerical output; see the section below. None of the donor patches is accepted or integrated. The independent private owner still transforms in the same-graph positive, while the source-observed owner is refused in each donor's addressed cases. The transitive donor additionally passed the existing seven-case property-proof suite and a two-key hot-path profile, with Ubuntu hot ratio 1.0003x and whole ratio 1.0065x in that **one** measured workload.

**Browser scope is narrower.** The tested [live Chromium classic-script open-host](https://github.com/FlareZ123/obfs/actions/runs/45129763718) and [three-script closed-world V8 graph](https://github.com/FlareZ123/obfs/actions/runs/45129934973) each preserve source but rewrite **zero** private properties. They supply safety controls and no browser-positive obfuscation evidence.

**Next design obligation:** a conservative, owner-aware synchronous source-observer effect across local callgraph edges, aliases, unknown member calls, implicit property getters, proxies, and global lexical getters, with strict-mode runtime boundaries and a stated trusted-host observability contract. Source-visible own fields should remain unchanged while independently proved private fields remain transformable. This is not a complete effect system or a formal proof.

**Release remains BLOCKED.** No production compiler change has been merged, no exact current-main full-suite acceptance has been established by this work, and no universal 2.5× CPU or hostile-runtime extraction bound follows from the measured examples. Detailed reproduction, initial harness defect, source pins, counterexamples, V8/MDN/esbuild documentation, and branch-specific observations follow below.


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

## Paired strict-mode boundary (later source pin)

An extension to the same test file, exact branch commit `2e915340a0f75b5904945ba62b833c88e32ba934`, added a strict-mode **caller** variant while keeping the host observer sloppy. [Two-platform focused run 45127203853](https://github.com/FlareZ123/obfs/actions/runs/45127203853) gave **3 source-parity failures and 6 passing controls per OS** (9 tests total per OS). Each additional strict caller still had one private property rewritten, both numeric outputs were 31, and both native/emitted `CallSite.getFunction()` observations were the literal `"undefined"`. This is consistent with the V8 strict-frame visibility boundary and limits the earlier finding to contexts where structured caller objects are available. It must not be extrapolated to strict ESM, debugger visibility, or universal absence of source extraction in strict contexts.

## External runtime documentation

The official [V8 Stack Trace API](https://v8.dev/docs/stack-trace-api) describes custom `Error.prepareStackTrace` callbacks receiving structured `CallSite` frames, including `getFunction()`. It explicitly says that a strict-mode function frame, and frames below it, expose neither `getFunction()` nor `getThis()` (both return `undefined`). This independently documents the runtime feature used by the two-platform tests, and limits the modeled observer capability. It does not prove compiler soundness, effect propagation, or a browser security boundary.

## Real SNO launcher source parity

The subsequent research-branch commit `8f17fbecbb0392491e9f104d65bc6fdd7981919a` extends the same executable suite to the actual `createSnoLauncher` entry mechanism: it writes a freshly compiled `case.cjs`, packages its SHA-256 manifest in `sno-entry.cjs`, then executes the actual Node CommonJS `require` path. The original file runs through its own native CommonJS loader, and the same external sloppy callback is installed as a host global for each run. All temporary files and host-global descriptors are cleaned up.

[Two-platform focused run 45127771222](https://github.com/FlareZ123/obfs/actions/runs/45127771222) verified **10 tests per OS: 6 passing independent/strict controls and 4 intentionally failing exact-source assertions**. The fourth failure is specifically the real SNO launcher: the initial SHA-256 manifest check succeeds, native and emitted CommonJS module exports both equal 31, the native callback sees `owner.privateSecret`, and the actual compiled launcher callback sees `owner._p086136c0d7`. This addresses the previous limitation that mode-label tests only exercised `obfuscateFiles` directly for SNO.

This is a reproducible **behavior-preservation defect in external function-source visibility**, not an SNO manifest-integrity failure or tamper bypass. The source under observation is a local **non-strict** CommonJS helper. It remains outside any claim about strict ESM, browser module evaluation, hostile Node interception, or the primary adversarial security and performance objectives.

## Equal-trust ordinary esbuild property-mangling control

The branch commit `e52ea33a5cf7699be130d78041f7493a3425f5f8` also invokes the repository's pinned **esbuild 0.28.2** with `transformSync` and explicit `mangleProps:/^privateSecret$/`, leaving broad minification disabled. This is the ordinary, source-visible property-renaming comparator, using the identical input and external `CallSite` observer.

[Ubuntu/Windows focused run 45128031033](https://github.com/FlareZ123/obfs/actions/runs/45128031033) gave **7 passing controls and 4 intentionally red compiler source-parity cases per OS**. The esbuild comparator passed its **expected mismatch** control on both OS: the original read `owner.privateSecret`, the esbuild output read `owner.a`; both returned 31, and the observed source strings differed. Its emitted function was also reformatted even with broad minification disabled.

This is evidence that **property rewriting with an unmodeled host source observer is a general compilation compatibility hazard**. It does not demonstrate that the research compiler has better or worse strict source-parity support than ordinary esbuild for arbitrary JavaScript, or any relative attacker-cost advantage. Unlike the research compiler, the comparator was explicitly asked to mangle the named field with esbuild's opt-in `mangleProps` option. The [official esbuild property-mangling documentation](https://esbuild.github.io/api/#mangle-props) cautions that this option cannot be assumed safe for arbitrary input.

## Selective owner-closure regression

The later research branch `f4bd8aa0f2959c3ee667ecc0ba07802e3e3499ce` adds one **same-graph, two-owner** regression. The host-observed `readPrivate` closes over `observedOwner.observedSecret=31`, and an independent owner `independentOwner.unrelatedSecret=73` is read only outside the observed function. Both native and compiled exports equal **104**; the observed function source differs after compilation, and the compiler reports **two** property rewrites. The desired conservative output would preserve the observed owner's source-visible key while retaining **exactly one** unrelated private rewrite. The fixture asserts both properties of this desired result, so it is intentionally red at present.

[Two-platform focused run 45128281043](https://github.com/FlareZ123/obfs/actions/runs/45128281043) on Ubuntu shows `CALLSITE_DISJOINT_OWNER` with `protectedProperties=2`, `nativeSource` containing `observedOwner.observedSecret`, and emitted source containing `observedOwner._pceb33ce2e5`. The wider suite's source-parity failures persist. This adds a positive-yield preservation contract for the canonical integration: **a global veto that sets the unrelated owner’s rewrite count to zero does not meet the fixture**. It does not propose or prove an implementation.

## Source-paired proof-of-concept and independent falsifiers

A deliberately isolated **experimental** branch `agent1/experimental-ambient-caller-proof-20261123` adds a narrow guard to `src/properties.js`: a helper previously considered direct-call-only/private is excluded if its body directly invokes an unbound identifier call. The unmodified branch `agent1/callsite-source-20261123` and experimental branch had **byte-identical test files** (Git blob `5a575da368511416e1fe356df840a2cf4cc7737b`) after aligning the acceptance assertions. The only substantive difference between those branch sources was the experimental property-proof gate.

On these identical **12** focused cases per operating system, [unmodified run 45128735013](https://github.com/FlareZ123/obfs/actions/runs/45128735013), SHA `3bbe46beaf15221a2f0829f668a4bcccf7a71d61`, passed **7/12** and failed **5/12**. [Experimental run 45128740430](https://github.com/FlareZ123/obfs/actions/runs/45128740430), SHA `c30d06a9430abe2366c842879ca4ace4222fb752`, passed **12/12** on both Ubuntu and Windows Node 22.23.4, including strict project/external and paired-budget JSDoc checks. The real SNO launcher source was preserved with zero rewrites in the observed program; in the disjoint-owner program, the observed owner was unchanged and the genuinely unrelated owner retained exactly **one** obfuscated property. Both programs returned their expected native values, 31 and 104. This is a local proof-of-concept correction, not an integrated compiler fix.

A separate held-out matrix then falsified sufficiency of the proposed direct-free-identifier criterion. The same test bytes were added to both branches, testing three other ways a host callback may inspect the caller: (1) an immutable alias `const saved=hostCallback`; (2) `globalThis.hostCallback()`; and (3) a local `deliver()` helper calling the external host. Each produces native numeric 31 and native source with `owner.privateSecret`, but current and experimental compiler both rewrite the source-visible key in **all three modes**.

The source-pinned two-platform [unmodified 45129005690](https://github.com/FlareZ123/obfs/actions/runs/45129005690) and [experimental 45129010969](https://github.com/FlareZ123/obfs/actions/runs/45129010969) show respectively **7/21 pass, 14/21 red** and **12/21 pass, 9/21 red** per OS. All **nine** held-out alias/member/transitive cases are still red under the narrow experimental guard. Therefore the experimental fix is **insufficient** and should remain isolated from main. A useful source-observer admission must reason about function-value aliases, property receiver provenance and transitive calls, and still preserve genuinely independent private rewrites. This is a proposed direction requiring further validation; arbitrary JavaScript call effects and hostile debugging remain unresolved.

### Existing property-proof smoke check

Before the nine-case held-out extension, the existing `test/property-proof-safety.test.js` completed green on both Ubuntu and Windows for the [unmodified branch run 45128899404](https://github.com/FlareZ123/obfs/actions/runs/45128899404) and [experimental branch run 45128905093](https://github.com/FlareZ123/obfs/actions/runs/45128905093); strict project/external/paired JSDoc also passed on both. This finite smoke check found no incompatibility with that test file. It does not repair or override the nine independent remaining red source-parity cases and is not a comprehensive same-head integration receipt.

## Proposed caller-stack effect obligation for integrators

A more complete implementation hypothesis is a **conservative synchronous call-graph effect** distinct from ordinary function-value escape. Let `H(f)` mean that evaluation of a function `f` can synchronously reach an unproved host callback with an observable caller frame. An initial overapproximation marks unknown direct calls, dynamic member calls, and aliases of functions whose concrete target is outside the closed program graph. For internal call edges `f → g`, propagate `H(g)` back to `H(f)` until a fixed point. The held-out matrix explicitly shows that checking only syntactic free call identifiers is insufficient.

For non-strict V8 frames, a host callback that captures a stack while `f` is active may use `getFunction()` to obtain the function object and subsequently its source text. A source-preservation obligation for `f` must therefore constrain every syntactically rewritten owner field and lexical name visible in `f`'s text, including keys captured from outer declarations. The owner/key relation must flow through the existing local and cross-file proof systems. Unrelated independent owner classes outside such obligations can still be rewritten. This maps to the same-graph positive fixture, which requires `protectedProperties=1` under the desired selective behavior.

V8's strict-frame masking supplies a separate capability boundary for this particular CallSite API; strict callers observed in the bounded test return `undefined`. However, compiler admission would need to consider direct `Function#toString` escapes, host serialization, stack-error strings, dynamic host instrumentation, and changes to runtime intrinsics independently. The fixed-point effect is a **research design**, not a formal theorem, exhaustive list of host effects, or verified production patch.

**Suggested canonical intake sequence:** retain the identical red fixtures as independent oracles; classify receiver/alias/host provenance; implement one sound conservative owner/source obligation with independently renamed positive records; validate all COO/SNO/SCO core cases plus real SNO loader, strict Node frame controls, existing property-proof tests, two-platform JSDoc, and then exact-source comprehensive mainline acceptance. This is intended as one composable item for Agent 3's canonical intake, with Agent 10's full acceptance separate.

## Real Chromium classic-script external-host control

The separately tested **one-file, open-host** COO classic-script path refused the property transformation entirely, so it preserved exact source: both native and emitted browser execution returned 31, and both host stack observations contained `owner.privateSecret`. The source-paired [unmodified run 45129763718](https://github.com/FlareZ123/obfs/actions/runs/45129763718) and [experimental run 45129769278](https://github.com/FlareZ123/obfs/actions/runs/45129769278) completed green, with their browser test executed in Linux Chromium and Windows skipped for unavailable pinned Chrome CLI. The strict external JSDoc, project JSDoc and paired-budget JSDoc also passed on both operating systems. A first attempt had a closure-scoping JSDoc test-harness error, later corrected in both branches; the corrected result is authoritative.

This bounds the Node issue: a **single open-host browser classic script with `closedWorld` not asserted** already exhibits conservative behavior and no visible source-parity failure. There is also **no independent private rewrite in that browser fixture** (property count zero), so a claim of browser positive coverage would be unsupported. A separate, fully supplied multi-script `closedWorld:true` graph is being checked independently; do not extrapolate the one-file control to that setting.

## Fully enumerated classic-script graph (Node VM)

To distinguish a missing host input from script source-shape conservatism, another test supplied **all three classic scripts** (`host.js`, `app.js`, `report.js`) to the same COO compiler call with `closedWorld:true`. It then evaluated native and emitted script sequences in a single V8 `vm.Context`, with the host callback itself inside the supplied compiler graph. The expected export was 31+73=104 and the observed caller source included `owner.privateSecret`.

Both [unmodified 45129934973](https://github.com/FlareZ123/obfs/actions/runs/45129934973) and [experimental 45129940493](https://github.com/FlareZ123/obfs/actions/runs/45129940493) Ubuntu-focused runs passed numeric and source parity: native and emitted values 104 and byte-identical source observation. **Both reported zero property transformations across the three-file graph.** The conservative source contract is therefore already enforced in these measured classic-script configurations. No claim of positive multi-script property yield is possible from this fixture.

This is a Node V8 `vm.Context` simulation of classic-script ordering with a complete compilation graph, **not** a second real-browser test. The separate one-file external-host Chrome experiment provides the live-browser check. The Node CommonJS modes remain the measured defective surface; avoid generalizing those failures to classic browser scripts without additional genuine positive-yield evidence.

## Transitive call-only experiment and implicit-call counterexample

A second isolated **research-only** candidate, `agent1/experimental-transitive-caller-proof-20261123`, generalizes the narrow direct-unbound-call guard: it regards unknown member/alias callees as opaque and recursively propagates an opaque effect through uniquely bound local function calls. [Two-platform run 45130273048](https://github.com/FlareZ123/obfs/actions/runs/45130273048) at exact `18e09e5454b3d57c3999dfb33e5ba8819e83bec7` passed **21/21** previously recorded explicit-call and source/positive controls on Ubuntu and Windows, plus strict project/external/paired-budget JSDoc. It retained one independent property rewrite in the disjoint-owner fixture. The existing [property-proof-safety focused suite 45130441528](https://github.com/FlareZ123/obfs/actions/runs/45130441528) passed 7/7 per OS. The established [source-stable wrapped profile 45130408678](https://github.com/FlareZ123/obfs/actions/runs/45130408678) remained green, emitted two private key rewrites, and on Ubuntu measured **hot ratio 1.0003x, whole ratio 1.0065x** for its specific 7M-iteration fixture (native median 4.401 ms, obfuscated median 4.402 ms). These measurements do not establish a universal compute budget.

An independent fourth capability class invalidates even this larger proof. A **sloppy host-provided getter** on `externalObserver.trigger` can call `hostCallback()` while the caller executes `void externalObserver.trigger`. The caller contains no `CallExpression`, yet the getter synchronously exposes the caller function through V8's structured stack. [Transitive-prototype two-platform run 45130560517](https://github.com/FlareZ123/obfs/actions/runs/45130560517) at exact `240230cc562e8d27b94b1cb7f24d3449f311cb5d` shows source mismatch and one renamed owner field in COO, SNO and SCO, despite numerical 31/31 parity. The suite is now **21/24 passing, three getter-based failures**, and the experimental call-only effect is **not sound** for hostile host environments.

These bounded results support a stricter future proof requirement: synchronous host-source observation may be triggered by **implicit JavaScript calls**, including property accessors and proxies, independently of explicit callgraph edges. Accesses through unproved external receivers must be considered as possible observer effects while proved local own-data primitive reads should remain eligible. A more recent global lexical accessor test is being checked as a further distinct implicit case. Do not merge either experimental patch as a source-observer solution.

## Ambient free-identifier getter (no call or member) and final experimental disposition

A fifth shape strengthens the implicit-effect falsifier. The host defines a sloppy accessor for the global binding `ambientValue`, where the accessor calls `hostCallback()`. The private helper body uses **only** `void ambientValue; return owner.privateSecret;`. Neither an explicit `CallExpression` nor an explicit `MemberExpression` exists for the observer trigger. The ambient global accessor executes while `readPrivate` is on the V8 stack and exposes that caller's source. The test injects the accessor as an external VM context property and never gives its source to the obfuscator.

The updated **27-case** source-paired run [unmodified 45130736668](https://github.com/FlareZ123/obfs/actions/runs/45130736668) at branch SHA `71dba6700916a6b7cd8719135682c95c52bd667a` is **7/27 pass, 20 red** on Ubuntu. The [experimental transitive-call 45130743620](https://github.com/FlareZ123/obfs/actions/runs/45130743620) at branch SHA `dac5fbb071404c6f04888a3b4304d8392007c3f7` is **21/27 pass, 6 red** on Ubuntu, with identical native and emitted numerical results 31. The six remaining failures comprise the three external-member getter cases and the three ambient global-identifier getter cases, one per SCO/COO/SNO mode; both prototypes still rename the source-visible owner key. Both operating systems reported failed focused runs on these files. The test files are identical across baseline and experimental branches; the source implementation is the material difference.

This falsifies the stronger **explicit-call graph** as a complete source-privacy criterion. Receiver property-get semantics and global lexical environment bindings can execute arbitrary host code while the private function is on stack. The source observer effect must therefore cover **implicit dynamic dispatch** through getters, Proxy traps, iterators, coercion and similar operations, with type-/owner-aware evidence that proven local data-property reads are inert. This list is illustrative, not a validated exhaustive JavaScript effect grammar. No compiler patch has been promoted to main. Both donor branches remain research-only and the repository release decision remains **RELEASE-BLOCKED**.

## Independent legacy Function.caller host source observer

A distinct legacy JavaScript host capability gives the same behavior without `Error.prepareStackTrace`. A sloppy, externally supplied `hostCallback` executes `String(hostCallback.caller)`, obtaining the non-strict direct-only `readPrivate` caller. The [MDN legacy Function.caller documentation](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/caller) records this implementation-dependent, deprecated API and its strict-mode restrictions; production code should not rely on its portability.

The source-paired **30-case** Ubuntu focused runs [baseline 45131200809](https://github.com/FlareZ123/obfs/actions/runs/45131200809), exact `3e3ca7ecf5e872f0bd7bd4d2595b6cccc4799b61`, and [transitive prototype 45131205755](https://github.com/FlareZ123/obfs/actions/runs/45131205755), exact `9d4daeeb826fa056b2303df16f860dedb646a693`, gave respectively **7/30** and **24/30** passing. The baseline transformed `owner.privateSecret` in all COO, SNO and SCO legacy-caller cases, preserving numerical31 while changing host-visible source; the transitive prototype conservatively preserved each source string. Its six remaining failures continue to be implicit external property getter and ambient global accessor cases, rather than legacy caller inspection.

This independent API strengthens the observation that protecting only V8's stack trace formatter is insufficient. The broader proof obligation involves externally observable caller function objects in any supported host capability, with strict-mode boundaries handled according to the actual runtime contract. It remains research evidence, **not** a complete list of all source-observing APIs.

### Latest source-pinned type-check control

The final 30-case **research branch** source at commit `9d4daeeb826fa056b2303df16f860dedb646a693` passed a separate [Ubuntu/Windows focused property-proof run 45131349191](https://github.com/FlareZ123/obfs/actions/runs/45131349191) including strict project JSDoc, strict external JSDoc for the entire 30-case test module and browser/classic harnesses, and the paired-budget evaluator JSDoc. This green workflow tests the independent established 7-case property proof, **not** the six intentionally red implicit-source cases. The immediate preceding [30-case source-parity run 45131205755](https://github.com/FlareZ123/obfs/actions/runs/45131205755) remains red on the same exact branch SHA. These statements are consistent and must not be confused with full-suite acceptance.

### Platform-paired positive runtime sample

The focused wrapped-private profile [45130408678](https://github.com/FlareZ123/obfs/actions/runs/45130408678) emitted exactly **two** renamed own keys and passed six matching behavior probes on both runner OSs. The measured **Ubuntu** hot/whole ratios were **1.0003× / 1.0065×** (native/emitted median 4.401 ms / 4.402 ms), while **Windows** hot/whole ratios were **1.0015× / 0.9925×** (native/emitted median 4.375 ms / 4.382 ms). This finite positive shows no meaningful added sustained runtime cost for that workload. It does **not** resolve the user-requested 2.5× bound for arbitrary programs, cold starts, browser deployments or attack resistance.

## Host-source guard precision veto: unreachable nested callback

A separate **positive-yield** check, `test/callsite-unreachable-nested-positive.test.js`, guards against overconservative admission. In all three modes, the private helper `readPrivate()` returns an owned numeric field but contains a nested, never-invoked local function or arrow mentioning an unresolved `hostCallback`. Three forms were tested: nested function declaration, stored arrow, and arrow inside `if(false)`. In these fixtures the nested callback is neither invoked nor exported; no host callback is supplied. Native and emitted module exports must equal **31**, and the locally private field remains eligible for exactly **one** property rewrite.

The **byte-identical test file** on both research branches was evaluated on Ubuntu and Windows Node22. [Unmodified baseline run 45132138220](https://github.com/FlareZ123/obfs/actions/runs/45132138220), source SHA `3c9c291bdcb1f04a54e8ab66f4aa9d41afbd2bdb`, passed **9/9** per OS, with `properties=1` for each case and numeric31 preserved. [Experimental transitive-call guard run 45132143552](https://github.com/FlareZ123/obfs/actions/runs/45132143552), source SHA `1a13e2f8fbd5c7ace9e01bafa20b10eacba6d77d`, failed **9/9** per OS: numerical parity held, but every case reported `properties=0`, violating the safe-yield positive. The experimental helper recursively `walk()`s nested function bodies as though they were synchronously executed by the enclosing function; the tests demonstrate **precision loss** against its promised purpose. These are **overrefusal failures**, distinct from the six existing observable-source soundness failures.

The result sharply limits the donor's utility: even after extending its call-effect rules to address the implicit getter counterexamples, it must avoid treating dormant nested functions as observable synchronous operations. A viable analysis would model **control-flow reachability and actual call edges** at the relevant execution point while conservatively retaining unknown-code effects; incidental presence of an unknown callback name within an unreachable function should not globally veto all owner rewrites. Both donor patches remain research-only, and this finite test does not itself prove that arbitrary nested callback calls are inert.

## Reachable-call-scoped precision repair and remaining soundness gap

To distinguish `walk()` traversing nested function *definitions* from executing nested function *bodies*, a third isolated donor `agent1/experimental-reachable-caller-proof-20261123` extends the transitive-call experiment. During the current caller's call-expression scan, it ignores `CallExpression` nodes lexically nested within a **different** function body; if the outer function actually calls a uniquely proved local nested function, its call edge recursively examines that callee instead. This is a limited syntax-scoped precision change, not a complete JavaScript effects model.

The source-pinned [positive-yield run 45132516162](https://github.com/FlareZ123/obfs/actions/runs/45132516162), experimental SHA `2b5c127723588de7585580e9330161da457bb3f0`, passed **9/9** dormant-nested positive tests on Ubuntu and Windows, with the required `properties=1` and numerical 31 in each COO/SNO/SCO form. Strict project/external/paired-budget JSDoc passed on both runner OSs. This resolves the specific overrefusal shown by transitive donor [45132143552](https://github.com/FlareZ123/obfs/actions/runs/45132143552), which had failed all nine.

The **same source pin** failed the existing source-observation [30-case run 45132521287](https://github.com/FlareZ123/obfs/actions/runs/45132521287): **24/30 pass, six red** on both Ubuntu and Windows. The surviving failures are precisely the external receiver getter and ambient global accessor callback paths; the nested precision fix cannot address those implicit effects. Consequently, it restores ordinary private transformation coverage without establishing sound caller-source isolation. The third donor remains research-only and must not be merged as a completed fix. It provides a concrete implementation guide to separate reachable nested callees from dormant closure bodies.

### Adjacent regression and CPU gates for reachable-call donor

The refined reachable-call research branch at the **same source SHA** `2b5c127723588de7585580e9330161da457bb3f0` also passed the existing seven-test property-proof suite on **Ubuntu and Windows**, [run 45132639329](https://github.com/FlareZ123/obfs/actions/runs/45132639329), and the established source-stable wrapped-private profile, [run 45132644834](https://github.com/FlareZ123/obfs/actions/runs/45132644834). Both workflows passed strict project/external/paired-budget JSDoc. The profile emitted **two** real private properties with six matching behavior probes. For its one 7M-iteration workload Ubuntu hot ratio was **1.0009×**, whole ratio **1.0210×** (native/emitted medians 4.346/4.350 ms); Windows hot ratio **0.9974×**, whole **0.9951×** (3.184/3.176 ms). These are finite, noisy CPU samples, not proof of a worst-case 2.5× bound. The source-observer [45132521287](https://github.com/FlareZ123/obfs/actions/runs/45132521287) six-case failure remains the independent reason this donor cannot be integrated as a complete solution.
