# Ambient Reflect/Object descriptor capability in closed-record property proof (2026-11-16)

**Status:** Intermediate, reproducible semantic-safety guard with a preserved transformed positive control. The source-only COO/SNO attacker model still defeats hostile-runtime locking and local integrity. No general security or performance theorem is claimed.

## Observed correctness failure

In the three-module `test/closed-record-visible-reflect-overwrite.test.js` ESM fixture, the compiler can recognize an immutable private record with a computed reader, then rename an independently exported state object's own key. That proof previously assumed calls to `Reflect.ownKeys` and `Object.getOwnPropertyDescriptor` retained their native behavior.

The declared entry obtains `Object.getOwnPropertyDescriptor(globalThis,'Reflect').value`. For a data property, the descriptor `value` is the actual original mutable global Reflect object (not a copy). The entry assigns its `ownKeys` method to a host-provided callback. This callback is an opaque preloader capability that imports the output `state.mjs` dynamically and observes `Object.keys(state)`. The original emits `[41,"audit-v1",["secretField"]]`; the previously transformed graph emitted a randomized own-key spelling. The same alias can be obtained through `Object.getOwnPropertyDescriptors` and `Reflect.get`, as well as captured native methods.

The first exact-source descriptor.value mismatch was reported by Agent 12 in [the earlier counterexample](global-reflect-descriptor-semantic-counterexample-2026-11-16.md) and reproduced on Linux and Windows at [red run 43855476774](https://github.com/FlareZ123/obfs/actions/runs/43855476774), SHA `0c9bdaec001831736b532ee0dc492c64b06f5770`. The independently rerunnable test here expands that family rather than inferring new red results from source inspection alone.

ECMAScript reference: [Object.getOwnPropertyDescriptor](https://tc39.es/ecma262/2026/multipage/fundamental-objects.html#sec-object.getownpropertydescriptor), [Object.getOwnPropertyDescriptors](https://tc39.es/ecma262/2026/multipage/fundamental-objects.html#sec-object.getownpropertydescriptors), [globalThis](https://tc39.es/ecma262/2026/multipage/global-object.html#sec-globalthis).

## Bounded compiler change

`src/cross-properties.js::safeClosedCallerRecordRead` now conservatively refuses the exceptional own-record proof in a supplied source graph when it sees a native descriptor/accessor call that may acquire a global `Reflect` or `Object` capability. It accounts for:

- Direct `Object.getOwnPropertyDescriptor`, `Object.getOwnPropertyDescriptors`, `Reflect.get`, and `Reflect.getOwnPropertyDescriptor` calls.
- Captured native method references propagated through direct identifier aliases, including multiple aliases.
- A direct global root, named aliases, nested member chains of local objects/arrays containing a global root, and immediate object/array expressions containing a global root.
- Unknown selector keys; a known, unrelated literal key remains eligible.
- Indirect first-class method invocation, including `.call`, `.apply`, and a method passed to an opaque higher-order call. These are conservatively excluded when the argument proof is unavailable.

The emitted runtime receives no new guard or decoder code. Rejected properties keep original spelling. This is a source-local may-alias exclusion with a finite syntactic coverage envelope, rather than a full JS realm effect analysis.

## Reproduction and pinned validation

Nine new descriptor/accessor acquisition and call shapes are checked by real Node 22 native-versus-compiled subprocess execution, using the same host callback. Each requires the original `[41,"audit-v1",["secretField"]]` output and **0** unproved cross-file property renames. The parallel anti-vacuity control acquires the known unrelated `UNRELATED_FIXTURE` descriptor, requires matching original/output execution, and requires **1** accepted cross-file rename.

The prior nine-category direct mutation suite, frozen six-module original, distinct own-key-only positive application, browser source-visible reflection test, SNO fixtures, source-only clone attacker, and sampled whole-session profiles remain in the manually dispatched application gate. The original frozen six-module source observing its own code is still intentionally untransformed; its 0/2 count must not be confused with the modified 2/2 own-key-only application.

- [Gate 43861886579](https://github.com/FlareZ123/obfs/actions/runs/43861886579): green, Ubuntu/Windows plus legacy Node runner at SHA `b17e56f365a4301f8f0b7abd1a6b4509aef63a28`, for the first five new negatives and positive.
- [Gate 43862447359](https://github.com/FlareZ123/obfs/actions/runs/43862447359): green, Ubuntu/Windows plus legacy Node runner at SHA `57f46d7782090f23aba8996739ab28e69b4da5c4`, for all nine new negatives and unrelated-descriptor positive; includes Linux Chromium application validation.

The targeted tests run through `.github/workflows/manual-application-challenge.yml` with a manual dispatch, not per-commit CI. The source branch is `agent4/ambient-descriptor-capability-20261116`.

## Decision and limitations

This is correctness-by-conservative-refusal, not evidence that emitted code is harder to recover. An instrumented COO or SNO runtime can still enumerate all keys; SCO can withhold server-private source but authorized oracle relaying remains feasible under unlimited valid queries.

The present scanner does not establish a complete capability/alias theorem: arbitrary function return provenance, external loaders, custom proxies, undetectable computed keys, ambient methods replaced before the module starts, and unrecognized higher-order operations remain beyond this syntactic proof. Other innate reflective functions could provide further alias pathways. A follow-on should use a formal value/escape model or a declared trusted-host contract before broadening the positive coverage claim.

The new guard runs at obfuscation time only; the accepted native emitted code carries no new runtime instructions from this change. Full compiler construction cost, arbitrary-application 2.5× bounds, and independent attacker resistance have not been established by these tests.
