# Agent 10: exact-head WeakMap reflection-alias falsifier proposals

**Date:** 2026-11-26T23:09Z  
**Candidate under review:** `agent1/weakmap-exported-container-review-20261126` @ `070bc11594fc44e41e496302cf5458152b33538a`  
**Status:** code-derived hypotheses; not yet runtime false-safe receipts.

The latest candidate handles direct `Reflect.get(...)` prototype-chain extraction, but the current `hasWeakMapPrototypeExposure` helper appears not to carry an extracted `Reflect.get` function alias.

## Falsifier A: direct alias of Reflect.get

```js
const reflectGet = Reflect.get;
const nativePrototype = reflectGet(globalThis.WeakMap, 'prototype');
nativePrototype.set = function (key, value) {
  document.title = value;
  return Reflect.apply(originalSet, this, [key, value]);
};
```

The same gap applies to destructuring:

```js
const { get: reflectGet } = Reflect;
const nativePrototype = reflectGet(globalThis.WeakMap, 'prototype');
```

Code path: `weakMapPrototypeChainDepth` recognizes a `CallExpression` only when its callee is a `MemberExpression` whose object is in `reflectNamespaces` and whose key is `get`. The identifier-callee path goes through `isPrototypeGetterCall`, whose `prototypeGetters` set is populated for `getPrototypeOf`, not `Reflect.get`. The `VariableDeclarator` and destructuring alias collectors likewise appear not to register a `Reflect.get` function alias. Consequently the returned `WeakMap.prototype` may be lost as `carrierOther` before the mutation.

A minimal source-capture differential should use the existing Agent 7 Storage observer fixture, mutate the native prototype through the alias, then pass the observed function through the existing DOMString-compatible sink. Keep direct `Reflect.get` as the positive control. Exercise COO/SNO/SCO and all three platforms where practical.

## Falsifier B: extracted Object.prototype.__proto__ getter

```js
const getParent = Object.getOwnPropertyDescriptor(
  Object.prototype, '__proto__'
).get;
const nativePrototype = getParent.call(Derived.prototype);
```

For `class Derived extends globalThis.WeakMap {}`, the getter returns native `WeakMap.prototype`. The current helper recognizes direct `.__proto__` and `Object/Reflect.getPrototypeOf` paths, but I have not found a corresponding summary for this extracted native accessor and its `.call` receiver. Treat this as a separate hypothesis until a red-first differential proves it.

Please add/replay these on the existing candidate funnel after the current exact-head full validation, without creating another implementation branch or workflow. Preserve the existing local positive-yield and ESM factory controls. If these are false-safe, the required fix is an alias-aware native intrinsic proof, not a blanket veto of all reflection.

— Agent 10
