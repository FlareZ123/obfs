# SNO native Web Storage source observations and bounded CJS capability provenance

**Agent 23 · 27 November 2026 · intermediate evidence, not an academic or release result.** All code was pushed to **test-only** or **simulation-only** branches. No `src/`, production compiler, package, or workflow code was changed by these investigations. The overall three-mode obfuscator remains **RELEASE-BLOCKED**; no static deobfuscation resistance, universal integrity, domain lock, 2.5× performance or comprehensive compatibility claim follows from these cases.

## I. Strict native named-property setter admission

Actual native Node 22 `--experimental-webstorage` invokes Web Storage's DOMString conversion when `localStorage.namedSourceParity=inspect` stores a callback. Native JSON's `stored` and `propertyValue` then include exact `function inspect(){const sourceSensitive=37;return sourceSensitive;}`. A transformed one-entry SNO hash-checking launcher stores `function inspect(){const _v17b8f5d7be38=37;return _v17b8f5d7be38;}`. Ordinary numeric results (37 and 11) agree; **whole JSON parity does not**. A native-only spelling mutation changes the stored source string without changing the numeric result, proving oracle sensitivity.

- Frozen Agent 1 parent `aa54147277fb98b244de25c4dd532cad294102ad`, corrected test-only branch `agent23/sno-named-setter-strict-oracle-20261127`, head `5c8e690ce19b4e5bb9ecaf85dacc8fd731158f17`: [focused 46062853935](https://github.com/FlareZ123/obfs/actions/runs/46062853935), **red Ubuntu, Windows, macOS** only on new exact-source check.
- Current-main source pin `53bb9627d85c2f95c66d86be9e747a50c150e1be`, corrected test-only branch `agent23/sno-named-setter-current-main-strict-20261127`, head `08c6b5618b6d240642de2733df03f1634cfa43b5`: [focused 46062804889](https://github.com/FlareZ123/obfs/actions/runs/46062804889), **red Ubuntu/Windows, 13 pass/1 fail**. Different source branch history, same exact String mismatch.

**Acceptance-contract correction:** in the current frozen architecture, `src/core.js` has a source-observer group veto and `src/identifiers.js` conservatively refuses identifier edits for source-observing files. Demanding an *unrelated same-file rename* while preserving exact native source **overconstrains the documented conservative acceptance contract**. Accordingly the corrected test permits a file-wide source-observing refusal, and a separate **primitive named setter** fixture requires full native/emitted parity **and a genuine unrelated identifier rename**. That positive case passes. The original overstrict first donor at `14378aedd0aa9acc6ededd53783601583a30d9c4` remains a future **precision challenge**, *not* a separate release blocker; the observed string mismatch independently survives the corrected oracle.

## II. Unrecognized interprocedural host receiver

The isolated test-only branch `agent23/sno-storage-cross-file-receiver-20261127`, head `87c1e0102f6dbef8d447159977b43403b3bac589`, adds `test/sno-storage-cross-file-receiver.test.js` on the same main pin. A helper CommonJS module exports `storageOf(){return globalThis.localStorage}` and `makeInspector(){function inspect(){const sourceSensitive=97;return sourceSensitive;}return inspect;}`. The entry calls both factories, then executes `storage.namedInterfileSource=inspect`. Both native and transformed modules launch through a real, one-executable-entry SNO hash-checking launcher.

[Focused 46063110747](https://github.com/FlareZ123/obfs/actions/runs/46063110747) is **red Ubuntu/Windows (one failure, one pass per OS)**: the transformed stored source contains `_vb58cac47b0cf` instead of the original `sourceSensitive` while both call values remain 97. A paired **primitive** named setter through the *same* interfile receiver factory has exact output parity and actually rewrites an independent helper binding; it passes. A separate [same-source-head validation 46063260230](https://github.com/FlareZ123/obfs/actions/runs/46063260230) passes a known-safe Storage test and strict project/external/budget evaluator JSDoc on Ubuntu/Windows; it is not a complete suite.

This is distinct from a direct named setter: an AST guard for `AssignmentExpression` with a syntactically recognized native Storage receiver does **not by itself** prove that `storageOf()` returned host Storage. The proposed narrow guard has **not been implemented or tested** on this witness; do not assert that an unmerged patch fails without executing it.

## III. Native reflective Storage paths

The separate test-only branch `agent23/sno-storage-reflective-webidl-20261127`, head `a10aa2c532bf4435bf030c0505aaa3518c29288c`, adds `test/sno-storage-reflective-sinks.test.js`, again based on `53bb9627`. Each fixture runs whole-JSON native/compiled SNO launcher differentials and a native-only lexical mutation control. [Focused 46065302387](https://github.com/FlareZ123/obfs/actions/runs/46065302387) is **red Ubuntu and Windows, 3 pass/3 fail**:

| Native Storage operation | Exact callable source parity | Matched primitive-value parity |
| --- | --- | --- |
| `Reflect.set(localStorage,'nativeReflectValue',inspect)` | **FAIL** — transformed callback local renamed `_ve322589fe000` | **PASS** |
| `Object.assign(localStorage,{nativeReflectValue:inspect})` | **FAIL** — local renamed `_v718d1c6b5a3e` | **PASS** |
| `Object.defineProperty(localStorage,'nativeReflectValue',{value:inspect,...})` | **FAIL** — local renamed `_vee5e70426ece` | **PASS** |

Each function still returns 47, and independent helper 9. The primitive controls **record but do not require** unrelated rename because reflective dispatch may be conservatively unproved. On this red focused run, JSDoc/full-suite steps were skipped, so it does not satisfy full acceptance. A pure local Node22.16 preflight independently confirmed the same three Storage host dispatches still stored function source after a JavaScript replacement of `Storage.prototype.setItem`; no browser or later Node version generality is inferred.

**Host caveat:** local Node22.16.0 `Reflect.set(localStorage,'x','value',{})` with a different explicit receiver caused the experimental native Web Storage runtime to terminate with `SIGSEGV` (exit 139). That is a *native host crash, not an obfuscator failure*, and this variant is excluded from the SNO parity suite. No claim about Node22.23.4 or browser behavior.

## IV. Finite, read-only CommonJS provenance experiment

Research branch `agent23/storage-capability-flow-prototype-20261127` adds `sims/cjs-storage-source-provenance.js` with extensive JSDoc and two focused tests. This **does not modify or configure the production compiler**. The analyzer tracks a bounded grammar: direct `localStorage`/`sessionStorage` and unshadowed `globalThis` members, immutable local aliases, exact literal relative `.cjs` imports and `exports` records, plain record fields, function references, bounded arguments and returns, and named property assignment. It carries shared record identity through aliases and invalidates stale field proofs after mutation/opaque effects. It emits file and span, receiver and RHS provenance trace, and `source-sensitive`, `primitive-control`, `unknown-host`, `unknown-value`, or `local-record` diagnostic classes.

**Do not confuse a warning absence or a syntactic `local-record` classification with proven harmlessness**: an attacker-controlled inherited setter, proxy, runtime-injected accessors, dynamic code, cyclic mutable modules or unmodeled host callback can still observe source/frame state. This is a *finite diagnostic*, not a rewrite authorization or complete semantic proof.

Reproducible CI evidence:
- [46063798504](https://github.com/FlareZ123/obfs/actions/runs/46063798504): initial nine examples green Ubuntu/Windows, strict JSDoc.
- [46063933580](https://github.com/FlareZ123/obfs/actions/runs/46063933580): three *deliberate red-first* alias/mutation/opaque-callback cases exposed stale `local-record` assumptions on both platforms.
- [46064050583](https://github.com/FlareZ123/obfs/actions/runs/46064050583): same 12 examples green with shared-record invalidation, JSDoc green.
- [46064153231](https://github.com/FlareZ123/obfs/actions/runs/46064153231): two red-first examples of a Storage receiver and callable passed **into** a local or exported function whose body writes to native Storage.
- [46064216364](https://github.com/FlareZ123/obfs/actions/runs/46064216364): bounded call-body observation repair green Ubuntu/Windows.
- [46065213332](https://github.com/FlareZ123/obfs/actions/runs/46065213332): deterministic **96 native Node Web Storage variants**, seed `0x23a51b7d`, across 12 direct/factory/alias/record/mutated receiver grammars and both callable/primitive values, green Ubuntu/Windows with JSDoc. Under the earlier classifier this produced 20 source-sensitive, 20 primitive-control, 14 unknown-host, 13 local-record and 29 no-warning classifications.
- [46065387961](https://github.com/FlareZ123/obfs/actions/runs/46065387961): additional red-first negative: **unknown host receiver with primitive RHS was silently omitted** (0 findings instead of 1), red Ubuntu/Windows. The subsequent narrowed fix at source commit `a91b4d076e087e1d7a9850ae926825456a4fb743` changes opaque receiver assignments to explicit unknown-host warnings. **Final two regression CI statuses pending** as of this report draft, and previous counts should not be reused for that newer classifier until remeasured.

No tests above measure attack reconstruction resistance, domain/environment lock effectiveness against attacker-controlled runtimes, or any 2.5× application-compute budget.

## Decision and handoff

Keep exact native/stored-source equality as a compatibility blocker, distinguish proven primitive or own-conversion-hook positive yield from source-observing whole-file conservative refusal, and treat any unproved host receiver/reflective dispatch as **unknown** pending a validated target-specific effect contract. The three distinct compiler surfaces are (1) direct named setter, (2) interprocedural receiver returned across modules, and (3) reflective named setter/internal host dispatch. Agent 1 remains the sole production source integration owner; Agent 10 owns combined acceptance. Before claiming progress or release, prove a **single pinned current-main-based review head** passes all negative and positive controls and the complete Node/Chromium/performance and attack gates. The current result remains **NO-GO**.
