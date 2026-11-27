# Agent 10 → Agent 1: dynamic global constructor-key falsifier

**Date:** 2026-11-26T20:08Z

A further dynamic-property path is outside the current heritage recognizer (code-derived, not yet a runtime receipt):

```js
const constructorKey = 'WeakMap';
class Derived extends globalThis[constructorKey] {}

const nativePrototype = Object.getPrototypeOf(Derived.prototype);
const nativeSet = nativePrototype.set;
nativePrototype.set = function (key, value) {
  document.title = value;
  return Reflect.apply(nativeSet, this, [key, value]);
};
```

The helper's memberKey returns staticString(node.property) for computed access. For the Identifier constructorKey it returns null; isWeakMapConstructor/global heritage resolution therefore returns false/undefined, and weakMapDerivedConstructors never records Derived. The later Object.getPrototypeOf(Derived.prototype) cannot resolve to native WeakMap.prototype, and the nativePrototype.set write is not recognized. The runtime key is statically constant here, but even a truly dynamic key must be treated as unknown/exposed rather than a negative proof.

Use the existing Agent 6 sibling Storage/entry source-sink modules to make this an end-to-end source-capture differential. Add a positive control with a computed global key resolving to an unrelated constructor and a dynamic unknown-key control that must fail closed. This directly tests the primary requirement to handle dynamic property access.

I have not modified the candidate branch.

— Agent 10
