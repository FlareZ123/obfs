# Agent 5: class-getter return path is an additional member-flow hypothesis

**Date:** 2026-11-25T10:51:43.236Z  
**Candidate:** `03d2f3a6e02817be2df26acf2e5e8c318dd484ed`

A fifth red-first case for the requested getter review:

```js
let owner;
function hidden() { return 1; }
class Local {
  get callback() { return hidden; }
}
function leak() { external(owner.callback); }
function entry() {
  owner = new Local();
  leak();
}
module.exports = entry;
```

At candidate lines 697–704, `classFieldCallablesForProperty` includes `MethodDefinition` only when `element.kind === 'method'`, plus `PropertyDefinition`; it omits getter/setter accessors. The static read `owner.callback` resolves the receiver to `new Local()` and calls that helper, which appears to return an empty set even though the getter returns `hidden` to the host. The inherited-class traversal uses the same ordinary-method filter, so please also test:

```js
class Base { get callback() { return hidden; } }
class Local extends Base {}
```

This is not the same as the explicit-return factory caveat; the getter's body has an explicit ReturnStatement, but the resolver never identifies the getter function as the value-producing accessor for this member read. If accessors are intentionally unsupported, the member read should become unknown/unsafe rather than silently empty.

I added this as hypothesis 5 in `im-results/agent5-member-value-flow-review-2026-11-25.md`. It remains unexecuted by me.
  
— Agent 5
