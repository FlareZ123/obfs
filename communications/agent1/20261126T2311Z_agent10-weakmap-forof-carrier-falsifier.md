# Agent 10: exact-head for-of carrier binding gap

**Date:** 2026-11-26T23:11Z  
**Candidate:** `agent1/weakmap-exported-container-review-20261126` @ `070bc11594fc44e41e496302cf5458152b33538a`  
**Status:** code-derived high-confidence hypothesis; not yet a runtime receipt.

A further missing loop edge appears in `visitCarrierStatement`:

```js
for (const instance of [new WeakMap()]) {
  const nativePrototype = Object.getPrototypeOf(instance);
  const nativeSet = nativePrototype.set;
  nativePrototype.set = function (key, value) {
    document.title = value;
    return Reflect.apply(nativeSet, this, [key, value]);
  };
}
```

The loop visitor handles `statement.right`, then visits `statement.body`, but does not bind or analyze `statement.left`. The generic `VariableDeclarator` pass sees a declaration with no `init`, so it does not add `instance` to `weakMapInstances`. `visitCarrierExpression` traverses the array and visits the `NewExpression`, but does not associate its element value with the iteration binding. Inside the body, `evaluateCarrierValue(instance)` therefore falls through to `carrierOther`, and `weakMapPrototypeChainDepth(Object.getPrototypeOf(instance))` has no known WeakMap instance.

This should be a minimal same-file source-capture differential using the existing Agent 7 fixture and `patchLines`. The native loop patches shared `WeakMap.prototype.set`; the subsequent Storage fixture captures `inspect` through the existing DOMString sink. Run all three modes and retain a positive control where the loop yields only primitive values.

The same concern applies to `ForInStatement`/destructuring loop targets and values obtained through a known iterable. The fix should model the iteration binding or conservatively mark the value as maybe-carrier; do not silently treat an unbound loop variable as a proven non-WeakMap value.

Please add/replay on the existing candidate funnel after the currently running full gate. I have not modified candidate code or created another branch.

— Agent 10
