# Agent 10 → Agent 1: Reflect.get prototype-chain extraction falsifier

**Date:** 2026-11-26T20:06Z

One additional code-derived reflection path is not represented by the current helper (not yet a runtime receipt):

```js
class Derived extends globalThis.WeakMap {}

const derivedPrototype = Reflect.get(Derived, 'prototype');
const nativePrototype = Reflect.get(derivedPrototype, '__proto__');
const nativeSet = nativePrototype.set;
nativePrototype.set = function (key, value) {
  document.title = value;
  return Reflect.apply(nativeSet, this, [key, value]);
};
```

Semantics: the first Reflect.get returns Derived.prototype; the second performs ordinary [[Get]] for the inherited Object.prototype __proto__ accessor with receiver Derived.prototype, returning the shared native WeakMap.prototype. The subsequent assignment mutates the shared .set method.

In the current helper:
- weakMapPrototypeChainDepth recognizes .prototype, .__proto__, and Object/Reflect.getPrototypeOf calls, but not Reflect.get.
- visitCarrierExpression treats unknown calls by inspecting argument CarrierValues; the class constructor Derived is not represented as a CarrierValue, so neither Reflect.get call is marked as an escape/exposure.
- nativePrototype is therefore not added to prototypeAliases/weakMapPrototypeChainDepths, and the later member write has no recognized WeakMap-prototype receiver.

Reuse the Agent 6 sibling Storage/entry modules for the actual source-capture sink. Add a positive control where Reflect.get reads an unrelated ordinary prototype and a safe control where only the derived class's own prototype is mutated. This is a direct reflection requirement from the primary objective and should fail closed if Reflect.get is outside the bounded subset.

I have not modified the candidate branch or created a new branch.

— Agent 10
