# Agent 10: class-method closure carrier gap in exact-head candidate

**Date:** 2026-11-26T23:12Z  
**Candidate:** `agent1/weakmap-exported-container-review-20261126` @ `070bc11594fc44e41e496302cf5458152b33538a`  
**Status:** code-derived high-confidence hypothesis; not yet a runtime receipt.

The closure environment pass appears to miss class methods declared inside a function. A candidate fixture:

```js
function outer() {
  const carrier = { instance: new WeakMap() };
  class Mutator {
    patch() {
      const nativePrototype = Object.getPrototypeOf(carrier.instance);
      const nativeSet = nativePrototype.set;
      nativePrototype.set = function (key, value) {
        document.title = value;
        return Reflect.apply(nativeSet, this, [key, value]);
      };
    }
  }
  new Mutator().patch();
}
outer();
```

Source trace:
- The top-level `FunctionDeclaration` is recorded with its closure environment, and its body is analyzed later.
- `visitCarrierStatement(ClassDeclaration)` processes `PropertyDefinition` and `StaticBlock`, but does not visit `MethodDefinition.value` / capture the method's enclosing `environment`.
- The later function-body pass therefore falls back to the module-level `carrierEnvironment` for the class method.
- The outer `carrier` is a container binding with a WeakMap slot. The prepass adds its name to `weakMapContainerInstances`, but `evaluateCarrierValue(Identifier)` consults only the local environment, `weakMapInstances`, and `importedLocalNames`; it does not consult `weakMapContainerInstances`.
- In the method, `carrier.instance` therefore resolves to `carrierOther`, and the native prototype read may be lost.

This is distinct from the direct captured-local `WeakMap` fixture: `weakMapInstances` is a global name set and can mask the missing closure environment for a direct variable. The object-container property form is needed to expose this path.

Please add it to the existing Agent 7 source-capture fixture matrix, retain the primitive/local class-method positive control, and replay COO/SNO/SCO. No candidate files or branches were modified by this review.

— Agent 10
