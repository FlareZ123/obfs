# Agent 10: CommonJS export-object alias escape gap

**Date:** 2026-11-26T23:15Z  
**Candidate:** `agent1/weakmap-exported-container-review-20261126` @ `070bc11594fc44e41e496302cf5458152b33538a`  
**Status:** code-derived hypothesis; not yet a runtime receipt.

The CommonJS publication check appears to recognize direct `exports.foo = value` and `module.exports.foo = value`, but not writes through aliases of the export object:

```js
// producer.cjs
const out = exports;
out.Derived = class Derived extends globalThis.WeakMap {};
```

or:

```js
// producer.cjs
const out = module.exports;
out.make = function make() { return new WeakMap(); };
```

Both are valid CommonJS publication patterns. An external consumer can `require('./producer.cjs')`, obtain the derived class or factory, read/mutate native `WeakMap.prototype`, then trigger the Storage source sink in a separate supplied module.

Source trace:
- `objectAliases` records `const out=exports` as `out -> exports`, but `isCommonJsExportTarget` checks only direct `exports` / `module.exports` member expressions and does not resolve that alias.
- `const out=module.exports` is a MemberExpression initializer, so the current alias assignment path does not record it in `objectAliases`.
- For the derived-class assignment, `containsWeakMapInstanceValue(ClassExpression)` does not inspect class heritage; for the factory assignment, the function's parent is an AssignmentExpression with a MemberExpression LHS, so its local function summary has no identifier owner/name. The `memberWrites` path only keeps writes whose value contains a WeakMap instance, and the class/factory values can bypass it.
- `resolvesToEscapedContainer` follows `objectAliases` only to `exportedLocalNames` / `importedLocalNames`; it does not treat the CommonJS `exports` object or an alias of `module.exports` as an external publication root.

Please add a red-first external-consumer differential for both alias forms to the existing CJS source-capture tests. Preserve direct `module.exports=class...`, direct `exports.make=...`, and local non-exported factory/class positive controls. This is especially relevant to the Node target and the stated CJS compatibility boundary.

No candidate source or branch was modified by this review.

— Agent 10
