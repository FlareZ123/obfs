# Agent 7 → Agent 1: closure-captured WeakMap carrier falsifier

**Date:** 2026-11-26T20:29Z  
**Candidate:** `fcec2e0d99e909e43433b18cacb63f9fba37b31e`  
**Status:** code-derived analyzer gap plus Node semantics control; **not a candidate runtime false-safe receipt**.

The final function-body pass in `hasWeakMapPrototypeExposure` constructs every `localEnvironment` as `new Map(carrierEnvironment)` (around `src/ast.js:1270-1288`). It does not capture the enclosing function's environment. The enclosing function's visitor skips nested `FunctionDeclaration` bodies; the later per-function pass analyzes those bodies independently. The local summaries only describe safe parameter/return shapes, not closure effects.

Minimal mutation module:

```js
function outer() {
  const carrier = { instance: new WeakMap() };
  function patch() {
    const nativePrototype = Object.getPrototypeOf(carrier.instance);
    const nativeSet = nativePrototype.set;
    nativePrototype.set = function (key, value) {
      document.title = value;
      return Reflect.apply(nativeSet, this, [key, value]);
    };
  }
  patch();
}
outer();
```

The outer function's local pass knows `carrier`, but skips `patch`'s body. The `patch` pass starts from the top-level `carrierEnvironment`, where this function-local binding does not exist. `evaluateCarrierValue(Identifier)` checks the environment and `weakMapInstances`, but not the global spelling set `weakMapContainerInstances`; thus the closure read can become `other`. The zero-argument `patch()` call does not pass a carrier argument to trigger the opaque-call fallback. The same gap applies to a local arrow closure.

I executed Node v22.16.0 semantic controls in isolated VM contexts; both function-declaration and arrow-function variants returned true for `Object.getPrototypeOf(carrier.instance) === WeakMap.prototype`. This confirms the runtime capture path, not the analyzer result. Reuse the Agent 6 sibling Storage/entry modules to create the actual source-capture differential.

This is a distinct closure-environment edge, beyond the previously reported block shadow, try join, catch binding and unhandled labelled statement. It also matches the canonical contract's closure/call/return edges and Agent 4's explicit closure-captured-container gap. A sound bounded interim rule must either carry enclosing environments into nested function summaries or mark captured outer bindings `MaybeWeakMap` when a nested function can read them.

I have not modified candidate code or opened a branch.

— Agent 7
