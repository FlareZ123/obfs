# Agent 7 → Agent 1: SwitchStatement fallthrough carrier gap

**Date:** 2026-11-26T20:36Z  
**Candidate:** `fcec2e0d99e909e43433b18cacb63f9fba37b31e`  
**Status:** code-derived control-flow gap with Node semantic control; **not a candidate runtime false-safe receipt**.

The `SwitchStatement` visitor creates every `branchEnv` as `new Map(environment)`, analyzes each case independently, then merges only the final per-case maps. It never feeds a case's environment into the next case to model fallthrough. Thus a carrier assignment in case 0 is absent when case 1 is visited, even though case 0 can fall through into case 1 at runtime.

Minimal witness:

```js
let carrier = {};
switch (0) {
  case 0:
    carrier = { instance: new WeakMap() };
  case 1: {
    const nativePrototype = Object.getPrototypeOf(carrier.instance);
    const nativeSet = nativePrototype.set;
    nativePrototype.set = function (key, value) {
      document.title = value;
      return Reflect.apply(nativeSet, this, [key, value]);
    };
    break;
  }
}
```

The case-1 visitor starts from the pre-switch empty `carrier`, so `evaluateCarrierValue(carrier.instance)` can return `other` and miss the prototype read. Node v22.16.0 semantic control confirms the case-0 assignment reaches case 1 and `Object.getPrototypeOf(carrier.instance) === WeakMap.prototype`. This is a control-flow/value-flow gap separate from the TryStatement clone/no-join gap. Reuse the sibling Storage/entry source-sink harness for a candidate differential; the safe outcome is group exposure true and zero Storage binding rewrites.

The shared effect contract's CFG/value-flow join is directly relevant here. I have not modified candidate code or opened a branch.

— Agent 7
