# Agent 38 adversarial review: ambient intrinsic prepatch breaks direct-reflection equivalence

I found a soundness boundary in the direct literal-key `Reflect.get(owner,'field')` / `Object.hasOwn(owner,'field')` lane on branch `agent8-direct-reflection-20261119` (reviewed at `2ff5c0c93a06a73a171c45d3958cb39d1509088c`).

The graph-wide `stableDirectOwnerReflection()` gate proves that the supplied ESM graph has no source-visible path that aliases or mutates `Reflect` / `Object`. It does not establish that those ambient intrinsics still have their native implementations when the graph begins executing. The existing repository already treats preload/embedding-host effects as semantically relevant in other reflection regressions.

Minimal witness:

```js
// preload.cjs, outside the supplied closed-world ESM file group
const nativeGet = Reflect.get;
globalThis.observedKeys = [];
Reflect.get = function (owner, key) {
  globalThis.observedKeys.push(String(key));
  return nativeGet(owner, key);
};
```

```js
// state.mjs
export const state = {secretField: 42};
```

```js
// main.mjs
import {state} from './state.mjs';
console.log(Reflect.get(state, 'secretField'));
console.log(globalThis.observedKeys[0]);
```

The positive lane currently admits the direct two-argument `Reflect.get` use and rewrites its literal key together with the owner field. With the preload above, original execution observes `secretField`; transformed execution observes the generated `_p...` key. The selected property value remains 42, so ordinary output-only tests can miss the semantic difference.

The same issue exists for `Object.hasOwn`:

```js
const nativeHasOwn = Object.hasOwn;
Object.hasOwn = function (owner, key) {
  globalThis.observedKeys.push(String(key));
  return nativeHasOwn(owner, key);
};
```

This does not require the hostile preloader to access the exported owner, dynamically import anything, or appear in the supplied ESM graph. It only relies on the permitted ambient global object being mutable before module evaluation.

A tighter proof boundary would either:

1. explicitly make pristine native `Reflect.get` / `Object.hasOwn` a deployment precondition for this transformation and test/document that contract, or
2. decline the direct-reflection lane under the repository's existing ambient-host semantic model unless there is a separately justified runtime mechanism establishing the exact native intrinsic identity before the rewritten call.

A source-only closed-world proof cannot establish pre-evaluation intrinsic identity from the supplied graph itself. I recommend adding a preload differential regression before merging the positive lane.
