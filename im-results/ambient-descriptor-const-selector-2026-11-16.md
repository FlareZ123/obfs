# Opaque-receiver descriptor keys: direct literal, immutable alias and dynamic selector (16 November 2026)

**Status:** Reproducible two-platform compiler semantic regression and bounded red/green repair. Not established deobfuscation resistance.

## Residual counterexample after PR #25

The closed-world ESM property proof had already been corrected for `Object.getOwnPropertyDescriptor(new Proxy(globalThis,{}), 'Reflect').value`. A source-visible immutable local key alias still evaded it:

```js
const k='Reflect';
Object.getOwnPropertyDescriptor(new Proxy(globalThis,{}), k).value.ownKeys =
  globalThis.HOST_REFLECT;
```

This reads the descriptor of the ambient Reflect data property through an identity Proxy, obtains the real mutable Reflect object and installs an opaque callback. The callback, supplied by a test-only Node CJS preloader, dynamically imports another exported source module and observes `Object.keys(state)`. The original emits `[41,"audit-v1",["secretField"]]`. The transformed code under the prior guard emitted `[41,"audit-v1",["_padeb9e66c7d8"]]`.

[Exact red Linux/Windows manual application workflow 43865686219](https://github.com/FlareZ123/obfs/actions/runs/43865686219), source `0804eb12446d6c40a1f1d64b163a71eff06ee892`. The single new immutable-selector case failed on both systems; the two other added variants (runtime-constructed sensitive key and indirect descriptor collection) were already refused by independent existing guards. This reports observed execution, not a source-only hypothesis.

## Local proof refinement and anti-vacuity case

`src/cross-properties.js::safeClosedCallerRecordRead` now collects only source-module **top-level `const` bindings with unique names and statically literal string initializers**. It reads these as selectors in direct or captured native `Object.getOwnPropertyDescriptor`, `Reflect.get`, and `Reflect.getOwnPropertyDescriptor` calls. A selector of `Reflect` or `Object`, or a selector that cannot be proved a unique static string, vetoes the exceptional cross-file own-record proof **independent of opaque receiver provenance**. `Object.getOwnPropertyDescriptors` retains a separate check for recognized global receiver and other reflection observations.

The new positive fixture uses an **unrelated** immutable `const k='UNRELATED_FIXTURE'` with an identity Proxy around `globalThis`. It requires the original and emitted Node results to match exactly and requires one actual cross-file own property rename. This protects useful transformation yield from blanket key-based refusal. Aliases with shadowing, reassignment, non-literal initialization, unknown imports or ambiguous resolution do not qualify for this proof. This compiler change adds no execution-time runtime instructions.

## Paired exact-source gates

- [Before: red manual application gate 43865686219](https://github.com/FlareZ123/obfs/actions/runs/43865686219), SHA `0804eb12446d6c40a1f1d64b163a71eff06ee892`.
- [After: green Ubuntu/Windows Node22, legacy Node22 and Chromium application gate 43866170045](https://github.com/FlareZ123/obfs/actions/runs/43866170045), SHA `7ca73ef421c82c9306141d57de9254839432598a`. Native/generated parity is asserted for all new negative cases, and the unrelated const-key positive still transforms exactly one own field.

The regression suite is `test/closed-record-visible-reflect-overwrite.test.js`; it now covers sixteen new method/receiver/selector acquisition shapes in addition to the pre-existing global mutation cases. Earlier reports `im-results/ambient-descriptor-capability-2026-11-16.md` and `im-results/ambient-descriptor-opaque-receiver-2026-11-16.md` explain direct/captured method and Proxy/factory receiver phases.

## Limits and future proof direction

This is compatibility-by-conservative-refusal under a finite ESM source graph, not demonstrated security under the project's full-control COO/SNO adversaries. Dynamic effects can still introduce an ambient capability through a Proxy, host method, loader, accessor return, or unknown computed key. It does not establish a general interprocedural alias theorem or full JavaScript realm closure. A static receiver provenance/effect lattice and explicit trusted-host contract should be considered before improving positive coverage beyond these bounded proofs.

Preserve a measured protected-work denominator in all reports: the original source-observing six-module fixture remains 0/2 fields renamed; a **distinct** deliberately edited own-key-only application remains 2/2, with public-code copy reconstruction still possible. The compiler change has no new emitted runtime instructions but no universal 2.5× application-time proof follows. Full suite validation, if run, must be attributed to its own immutable SHA rather than this targeted green gate.
