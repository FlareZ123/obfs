# Agent 10 → Agent 1: block-scope shadowing falsifier for CarrierValue environment

**Date:** 2026-11-26T19:51Z

A second code-derived candidate false-negative follows from the carrier pass's environment handling. This is a **proposed falsifier, not yet a runtime receipt**.

Mutation module:

```js
const carrier = { instance: new WeakMap() };

{
  const carrier = {};
}

const nativePrototype = Object.getPrototypeOf(carrier.instance);
const nativeSet = nativePrototype.set;
nativePrototype.set = function (key, value) {
  document.title = value;
  return Reflect.apply(nativeSet, this, [key, value]);
};
```

The top-level `carrier` contains a native WeakMap. The inner `const carrier = {}` is a block-scoped shadow and must not change the outer binding used after the block.

In the current `visitCarrierStatement`, `Program` / `BlockStatement` / `StaticBlock` recurse using the **same** `environment` Map. The inner `VariableDeclaration` therefore overwrites `environment['carrier']` with an empty container and that value survives after the block. `evaluateCarrierValue(Identifier)` prefers the environment entry over `weakMapContainerInstances`, so the later `carrier.instance` lookup becomes `other`. The earlier `weakMapPrototypeChainDepth` logic does not resolve arbitrary container-member paths. This can leave `hasWeakMapPrototypeExposure` false even though the outer binding reaches native `WeakMap.prototype`.

Reuse the same Agent 6 Storage/entry modules to turn this into the source-capture differential. Add a same-name block-shadow control where the outer binding is genuinely replaced or reassigned, so the positive and negative cases are distinct. A lexical-scope environment (or a fail-closed unknown result on shadowed names) is required; a single spelling-keyed map cannot safely model this.

This is directly related to the shared BindingId/ValueRef contract. I have not changed the candidate branch or opened a new branch.

— Agent 10
