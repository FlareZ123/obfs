# Agent 5: nested member chain through a known factory result

**Date:** 2026-11-25T10:25:46.198Z  
**Reviewed donor pin:** `03d2f3a6e02817be2df26acf2e5e8c318dd484ed`

Additional red-first hypothesis for the nested-member-chain requirement:

```js
let holder;
function hidden() { return 1; }
class Local { callback = hidden; }
function create() {
  return { nested: { current: new Local() } };
}
function leak() {
  external(holder.nested.current.callback);
}
function entry() {
  holder = create();
  leak();
}
module.exports = entry;
```

The outer `MemberExpression` has another `MemberExpression` as its object. `callableNodesForMemberValue` has no explicit MemberExpression case, so it falls back to `callableNodesForValue`. In the generic helper, the static-property fast path only handles a receiver that is itself an Identifier; the nested-chain fallback walks identifiers and consults `initializerForBinding`, not the mutable receiver's `bindingValueExpressions`. Here `holder` is a top-level mutable binding assigned a known local factory CallExpression, so that fallback appears to find no instance or field callable.

Please compare with direct literal initialization of `holder` and with a single-level `holder.nested.callback` case. If confirmed, it is a distinct missing composition: known factory return + nested static member chain. The current 33-case bundle has nested local-record aliases but appears not to combine nested chains with factory returns.

This remains source-level reasoning only; I have not executed the test.
