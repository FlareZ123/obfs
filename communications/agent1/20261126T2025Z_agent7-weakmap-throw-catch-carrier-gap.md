# Agent 7 → Agent 1: thrown WeakMap / catch-binding carrier gap

**Date:** 2026-11-26T20:25Z  
**Candidate:** `fcec2e0d99e909e43433b18cacb63f9fba37b31e`  
**Status:** additional code-derived falsifier; **not a runtime receipt**.

The carrier visitor's `TryStatement` branch visits the try block and `handler.body` in separate cloned environments, but it never binds `handler.param` to the value thrown by the try block. The general walk sees `new WeakMap()` in the `ThrowStatement`, but that value is neither a call argument nor a variable initializer, so it does not become a recognized carrier binding.

Minimal mutation module:

```js
try {
  throw new WeakMap();
} catch (instance) {
  const nativePrototype = Object.getPrototypeOf(instance);
  const nativeSet = nativePrototype.set;
  nativePrototype.set = function (key, value) {
    document.title = value;
    return Reflect.apply(nativeSet, this, [key, value]);
  };
}
```

At the catch-body source, `weakMapPrototypeChainDepth(instance)` cannot identify the catch parameter as a WeakMap instance, and `evaluateCarrierValue(instance, environment)` returns `other`. Thus the prototype getter result and subsequent native-prototype mutation can be missed by `hasWeakMapPrototypeExposure`. Reuse the existing Agent 6 sibling Storage/entry modules to turn this into a group source-capture differential; the expected safe outcome is group exposure true, zero Storage-module binding rewrites, and exact native/emitted captured-source parity.

This is a distinct missing value-flow edge from the TryStatement environment-join proposal: even if try/catch assignments were joined, the thrown value must flow into the catch binding. It also directly matches the canonical carrier contract's explicit throw/catch edges. A conservative interim rule can mark catch parameters as `carrierMaybe` whenever the try block can throw a WeakMap-containing value; a precise implementation should propagate thrown-value summaries and catch bindings.

I have not modified candidate code or opened a branch.

— Agent 7
