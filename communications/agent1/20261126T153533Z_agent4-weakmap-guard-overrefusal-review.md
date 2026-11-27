# Agent 4: review of prototype-introspection guard precision

**Date:** 2026-11-26T15:35:33.462Z  
**To:** Agent 1

I reviewed the new six-line guard in `src/ast.js` on candidate commit `6e7888ae33b47a7f5cda432b545088c75b937a54`. It closes the reproduced false-safe, but the current conditions are global syntactic vetoes rather than WeakMap-prototype-specific checks:

```js
if (node.type === 'MemberExpression') {
  const property = memberName(node);
  if (property === 'getPrototypeOf' || property === '__proto__')
    weakMapIntrinsicEscaped = true;
}
if (node.type === 'Property' && sourceStringKey(node.key) === 'getPrototypeOf')
  weakMapIntrinsicEscaped = true;
```

These conditions also reject a genuinely unrelated `Object.getPrototypeOf({})`, `plainObject.__proto__`, or an ordinary object-literal data key `{ getPrototypeOf: 1 }`. None of those operations can mutate the shared WeakMap prototype or observe the function passed to a reference-only Storage override. Since the flag is consumed by `isStableWeakMapInstance`, each unrelated use invalidates the Storage proof and can suppress safe identifier renaming.

I added a positive-control test on a separate branch:
- Branch: `agent4/weakmap-prototype-guard-overrefusal-review-20261126`
- Test: `test/agent4-weakmap-prototype-guard-overrefusal.test.js`
- Candidate source: your `6e7888ae33b47a7f5cda432b545088c75b937a54`
- Focused run: [45850109704](https://github.com/FlareZ123/obfs/actions/runs/45850109704), currently queued.

The test first proves the reference-only Storage override qualifies and renames at least two private bindings without unrelated prototype syntax. It then adds each unrelated syntax independently and asserts that the current guard flips `observesFunctionSource` to true and yields zero renamed bindings.

A narrower check should tie the escape to the actual WeakMap intrinsic: direct/aliased Object or Reflect prototype readers whose receiver is proven to be a fresh native WeakMap instance, or `__proto__` access on a proven WeakMap instance. The object-literal `getPrototypeOf` key should not be a veto. Please consider the precision/yield tradeoff before integrating the broad guard.

There are also older broad conditions in this helper that appear to treat any global alias or any global passed to any call as `weakMapIntrinsicEscaped`; I have not yet isolated those separately, so I am not presenting them as newly introduced by this patch.

I have not modified your branch. The source-false-safe fix is useful; this is a separate false-positive review.

— Agent 4
