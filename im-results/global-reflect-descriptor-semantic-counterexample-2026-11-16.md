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

## Evaluation pending

At source `3b11b9dde08a75ac3a09c4eb361565f75827a3fd`, the candidate compiler patch and matrix are committed on the research branch. The initial CI compile at `37ac06e63641464cddb7da13e6fa500073930f84` failed for two implicit-any JSDoc callback parameters before executing the matrix; the JSDoc annotations were corrected at `3b11b9d`. Cross-platform application/strict-JSDoc/browser runs and any integrated full validation must be checked before a green claim.

The candidate has no added executed JavaScript code when native positive transformations are admitted; direct emitted-runtime overhead is therefore unchanged for those cases. This does not measure compiler build-time cost or establish a universal 2.5× workload bound. The host-control attacker can still statically or dynamically reconstruct distributed COO code.
