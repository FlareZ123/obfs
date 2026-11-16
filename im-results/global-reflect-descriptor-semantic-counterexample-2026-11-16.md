# Descriptor-mediated global reflection replacement: source-visible semantic counterexample (2026-11-16)

**Status:** independently reproducible paired cross-platform red witness; localized compiler repair under validation. Intermediate compatibility evidence, not an obfuscation resistance result.

## Input and observation

A three-module COO ESM graph contains an exported `state={secretField:41}`, a record reader that uses `Reflect.ownKeys(schema)` and `Object.getOwnPropertyDescriptor(schema,...)` on a private literal schema, and an entry importing both modules. The entry contains a source-visible global mutation:

```js
Object.defineProperty(globalThis,'Reflect',{
  value:globalThis.HOST_REPLACED_REFLECT,
  configurable:true,
  writable:true
});
```

A test-only Node CJS preloader supplies `HOST_REPLACED_REFLECT` as an object inheriting the original Reflect methods but replacing `ownKeys` with an opaque host callback. The callback dynamically imports the exact emitted `state.mjs` and records `Object.keys(state)`. The source-visible mutator is part of the input supplied to the compiler; the external callback is intentionally an opaque runtime contract. Real Node 22 ESM loaders execute original and emitted graphs separately.

At `1ad0d664dc4c3a8b33cde7aa848991bc26b6f88e`, the compiler rewrote **one** cross-file state key. The native output was `[41,"audit-v1",["secretField"]]`, while the emitted output was `[41,"audit-v1",["_p36a450d48cd5"]]`. The numeric and record values agree, but the observable exported object's own-key spelling differs. This violates exact behavior preservation for the demonstrated source and host callback.

- Initial field-count red on both Ubuntu/Windows: [Actions 43846404496](https://github.com/FlareZ123/obfs/actions/runs/43846404496), exact SHA `e3df27b2e25d3b9213c30ebf0db5187f74325f97`.
- Real native/generated output mismatch red on both Ubuntu/Windows: [Actions 43846794522](https://github.com/FlareZ123/obfs/actions/runs/43846794522), exact SHA `1ad0d664dc4c3a8b33cde7aa848991bc26b6f88e`.
- Research branch: `agent12/reflect-descriptor-host-20261116`, regression in `test/closed-record-visible-reflect-overwrite.test.js`.

The JavaScript semantics of [Object.defineProperty](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/defineProperty), [Reflect.ownKeys](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Reflect/ownKeys) and [globalThis](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/globalThis) permit this kind of source-visible global binding replacement.

## Bounded proposed repair

The previous `src/cross-properties.js::safeClosedCallerRecordRead` proof handled direct `Reflect.ownKeys=...` and obvious aliases but missed a call that mutates the global `Reflect` binding by a property descriptor. The candidate patch checks declared calls to `Object.defineProperty`, `Object.defineProperties`, `Object.assign`, `Reflect.defineProperty`, `Reflect.set`, and `Reflect.deleteProperty` with a verified direct global/alias receiver. A statically known `Reflect`/`Object` key or an unknown key invalidates the native-reflection own-record exception. Literal unrelated global own keys remain admissible. This is compile-time analysis, not a runtime wrapper.

The extended regression matrix compares actual native and generated outputs under four forms of explicit global binding replacement and requires zero renamed cross-file state keys. An unrelated literal global own-key write is an anti-vacuity positive case requiring one rewritten private state field. The narrowed mechanism is deliberately a bounded guard, not a whole-JavaScript-realm or alias-completeness theorem. Indirect method aliases, external preloaders, loaders, and arbitrary host effects remain outside this proof.

## Validation and performance scope

The initial candidate at `37ac06e63641464cddb7da13e6fa500073930f84` failed compiler JSDoc checks on two implicit-any callback parameters, repaired at `3b11b9d`. Additional native global-mutator method alias coverage was added at `b39bd487`. Main's concurrent Agent21 host-container proof was reconciled with this branch in the two-parent merge `a7be7d4340868470d606594ac4a328eb907fbcd9`. No main proof behavior was intentionally discarded.

[Pinned integrated application run 43850058997](https://github.com/FlareZ123/obfs/actions/runs/43850058997), exact compiler source `a7be7d4340868470d606594ac4a328eb907fbcd9`, **passed all three jobs**: Ubuntu Node22, Windows Node22, and Ubuntu Node22.0.0. The gate ran strict compiler/external JSDoc, native/generated Node ESM differential comparisons for direct and aliased descriptor/set/assign global mutations, positive private-field coverage, adversarial host callbacks, offline copy attacks, SNO regression/profile, and three real Chromium integration programs. The fully declared descriptor replacement and all additional mutation cases preserve exact output and refuse unsound renames. A statically unrelated global own-field change still permits one independently proved private-field rewrite.

Independent browser positive `VERIFIED_RECORD_CHROMIUM` matched **64/64** cases with **two** renamed private fields. The original frozen six-module application remained **0/2** transformed, and its public-code copy attack reproduced 128/128 held-out outputs. Original frozen whole-session ratios on Ubuntu/Windows were **1.0050× / 1.0027×** on this run; these are mostly unchanged-source controls and cannot be used as evidence that protected operations became harder to clone. Chromium hostile-realm injection still observes randomized field names despite clean-host parity. The narrower direct emitter patch inserts no runtime JavaScript, but the complete compiler build overhead and a universal 2.5× upper bound were **not** measured. A broader integrated full-validation gate remains necessary before any release claim.

The candidate has no added executed JavaScript code when native positive transformations are admitted; direct emitted-runtime overhead is therefore unchanged for those cases. This does not measure compiler build-time cost or establish a universal 2.5× workload bound. The host-control attacker can still statically or dynamically reconstruct distributed COO code.

## Broader exact-source validation

[Manual full validation 43850390498](https://github.com/FlareZ123/obfs/actions/runs/43850390498) **passed** Ubuntu and Windows Node22 at source-identical report-updated branch commit `6098594d0fb7c2e04851d531b937fd824df50703`. This job exercises the broad compiler regression suite, hostile-source observation and export checks, full cross-mode smoke/performance probes, and Linux Chromium examples (15 browser pages successful); the separately modified own-key-only application retains two renamed fields under the earlier application gate.

For that **genuinely transformed distinct own-key-only application**, `VERIFIED_RECORD_SESSION_PROFILE` recorded nine paired full-process samples per case and platform. Linux one-event native/emitted medians were 26.7681/27.1769 ms (**1.0153×**), sustained 80 events 38.7952/38.8682 ms (**1.0019×**). Windows one-event medians were 42.4909/42.2443 ms (**0.9942×**), sustained 80 events 52.3271/52.3527 ms (**1.0005×**). Every output matched. These workload-specific ratios are below the 2.5× budget; they are separate from the frozen original 0/2-key app and do not measure resistance to attackers who copy all client code.

Additional real-Chromium source-visible descriptor parity and unrelated-field positive-yield fixture `test/closed-record-reflect-descriptor-browser.js` was added after the full gate, with an explicit Linux step in `.github/workflows/manual-application-challenge.yml` and JSDoc inclusion in `jsconfig.external.json`. **Its independent browser run is pending** as of this report update; do not claim it passed solely from the earlier general Chromium gate.

## Second adversarial refinement: global root inside source-owned containers

The first green bounded guard had another demonstrable receiver escape: a declared program can write `const roots=[globalThis]` and invoke `Object.defineProperty(roots[0],'Reflect',...)`, or write `const holder={root:globalThis}` and mutate `holder.root`. Neither direct-global identifier nor immediate global alias analysis recognized the receiver, so the compiler emitted a foreign owned-state key rewrite. Native `[41,"audit-v1",["secretField"]]` differed from generated `[41,"audit-v1",["_p1710d4f2eed0"]]` (array case) and `[41,"audit-v1",["_p6882b3d7e810"]]` (object case). Independently verified Ubuntu and Windows real Node22 ESM red at exact `fa8ad6ee8462adc8414a7072043c25fd67214301`, [CI 43852603614](https://github.com/FlareZ123/obfs/actions/runs/43852603614). These are source-visible host-callback conditions, not imaginary root identity guesses.

The revised proof refuses source-visible native `Object.defineProperty`, `Object.defineProperties`, `Object.assign`, `Reflect.set/defineProperty/deleteProperty` mutations of the `Reflect`/`Object` binding name whenever the mutator's receiver could be forwarded through unproved containers or calls. Proven unrelated literal keys remain admissible; captured native mutator aliases conservatively decline regardless of receiver because their identity and flow are insufficiently proved. This correction introduces potential false-positive refusals for locally owned objects with keys named `Reflect` or `Object`; such precision optimization requires a separate receiver-disjointness proof and positive tests.

At source `f92ce047489aeb8a3a4f3e55244dd21aff91da2f` and new actual-differential tests, [application run 43852807511](https://github.com/FlareZ123/obfs/actions/runs/43852807511) **passed** all three jobs (Ubuntu/Windows/Node22.0.0). The Linux real-Chromium output was `GLOBAL_REFLECT_DESCRIPTOR_CHROMIUM` with declared replacement **0 renames, exact parity** and unrelated global descriptor **1 rename, exact parity**. The separate 64-case Chromium own-key graph still rewrote two fields and matched all outcomes. This green run is specific to the candidate branch and its exact SHA. Both source and red/green tests were copied into `agent12/reflect-descriptor-host-20261116` at commits `3ff77c5` and `3e00bb4`; an exact integrated full validation on the feature head remains to be run.
