# Source-visible ESM mutation of native reflection: paired red/green (2026-11-16)

**Status: experimentally demonstrated semantic-safety counterexample and bounded compiler repair.** No claim of new resistance to reconstruction.

## Counterexample

The same three-module ESM fixture used for a positive private-owner proof was supplied to the compiler, with a visible additional assignment in entry.mjs:

    Reflect.ownKeys = globalThis.HOST_REFLECT;

The entry imports a state object with a private field secretField:41 and an exported inspectRecord function. inspectRecord calls Reflect.ownKeys on an unescaped local immutable record and reads its proven own field externalFormat. The ambient host callback HOST_REFLECT is opaque and supplied by a Node CJS preloader. It retains native key enumeration, but additionally dynamically imports the published state.mjs via Function('uri','return import(uri)') and saves Object.keys(namespace.state) in a global promise. The entry awaits that promise, printing the normal computed number, the record's value, and the observed keys. The assignment to the native intrinsic is **part of the source group given to the compiler**.

The pre-repair compiler emitted one renamed private field despite this explicit Reflect.ownKeys overwrite. The [pinned pre-fix failure 43838259466](https://github.com/FlareZ123/obfs/actions/runs/43838259466) at exact SHA 5e64b08c19ed70d9f3ecf424530c45de64636b55 recorded a rejected assertion (actual 1 rewritten field vs expected 0) on Ubuntu and Windows.

A separate [causal pre-fix branch](https://github.com/FlareZ123/obfs/tree/agent12/reflect-intrinsic-red-causal-20261116) changed only the test assertion to expect the original unsafe rewrite and to execute native versus emitted ESM in separate real Node loaders with the same preloader. [Pinned causal app run 43838833601](https://github.com/FlareZ123/obfs/actions/runs/43838833601) passed on Ubuntu/Windows and legacy Node 22. It confirmed the native and compiled outputs differ in the emitted property name observed through a dynamic import. Both retain the ordinary computed value 41 and the record value audit-v1. This is an actual source-visible semantic mismatch under an opaque host callback.

## Repair and regression

Commit dda116ed8c3c320992c1dc79ae56b03cf9e7d9c6 updates the narrow safeClosedCallerRecordRead proof in src/cross-properties.js. Before trusting an unescaped local literal record's native reflection, it conservatively scans all supplied ESM files for a direct assignment, update, or deletion of Reflect.ownKeys or Object.getOwnPropertyDescriptor, including static-string computed spellings. A found mutation declines the own-record exception, allowing the existing broad unknown-computed-key veto to preserve the emitted original field. This adds no runtime helper and makes no change to the owner's other positive cases.

The repaired test in test/closed-record-visible-reflect-overwrite.test.js expects zero renamed properties and exact native/emitted output [41,"audit-v1",["secretField"]].

- [Pinned application/attacker gate 43838621841](https://github.com/FlareZ123/obfs/actions/runs/43838621841): Ubuntu/Windows and legacy Node 22 passed, including the new regression, hostile inherited-constructor refusal, frozen application controls, strict JSDoc, native ESM comparisons, independent public-file copying and budget samples.
- [Pinned targeted broader semantics 43838628633](https://github.com/FlareZ123/obfs/actions/runs/43838628633): Ubuntu and Windows passed the existing semantic and typecheck suites.
- The source-only host mutation comparison test/closed-record-host-hook-attack.test.js remains a separate experiment: when an entirely unknown preloader replaces native Reflect outside compiler input, original/emitted property-name observations differ. It is an explicit **host-control limitation**, distinct from the source-visible correctness defect.

## Scope

This is a targeted direct-member mutation guard, not a theorem about all aliases, dynamic intrinsic replacement or hostile realms. Alias writes, globalThis.Reflect mutation, Object.defineProperty override, dynamic import maps and preloader-only alterations need independent adversarial coverage. Do not present a pristine closed-source proof as complete resistance to a host controller.

The frozen six-module original application still has 0/2 protected private fields renamed under independent source observers and the required inherited missing-key safety guard. A deliberately different own-key-only variant obtains positive 2/2 coverage but is publicly reconstructible. The 2.5x runtime condition remains workload-specific; no universal speed claim follows from this source-only refusal repair.
