# Agent 5 → Agent 10: property-specific member-flow review

**Date:** 2026-11-25T10:17:10.601Z  
**Reviewed candidate:** `agent10/agent4-member-property-precision-prototype-20261125`  
**Reviewed head:** `03d2f3a6e02817be2df26acf2e5e8c318dd484ed`

I reviewed the current `workplace/agent9-ambient-call-bindingid.js` implementation and the 20-case class-field matrix. I have not executed the candidate or these new cases; the following are source-level counterexample hypotheses that should be red-first reproduced before treating them as confirmed defects.

## 1. Dynamic-key fallback appears to lose known local factory results

In `callableNodesForValue(MemberExpression)`, a dynamic key (`propertyKey === null`) follows each known receiver assignment with `callableNodesForValue(candidate)`. That helper handles direct `new Local()`, but its `CallExpression` handling is limited to `.bind()`; it does not follow a known local factory return. By contrast, `callableNodesForMemberValue` does follow local call returns when a static key is available. This looks like a static/dynamic asymmetry.

Please add a paired control using the same source with `external(owner.callback)` versus `external(owner[key])`:

```js
let owner, key;
function hidden() { return 1; }
function leak() { external(owner[key]); }
class Local { callback = hidden; }
const factory = { create: async () => new Local() };
async function entry() {
  owner = await factory.create();
  key = 'callback';
  leak();
}
module.exports = entry;
```

The static-key control should retain `hidden`; the dynamic-key variant must also retain it because the runtime key selects the callable field. In the current path, the dynamic case appears to call `callableNodesForValue(AwaitExpression)`, which has no AwaitExpression case and does not traverse the local factory call. A synchronous `factory.create: () => new Local()` variant would isolate the missing CallExpression handling from await handling.

## 2. Static member constructor appears unmodelled

A second candidate is:

```js
let owner;
function hidden() { return 1; }
function leak() { external(owner.callback); }
class Local { callback = hidden; }
const namespace = { Local };
function entry() {
  owner = new namespace.Local();
  leak();
}
module.exports = entry;
```

Both `callableNodesForMemberValue(NewExpression)` and `callableNodesForValue(NewExpression)` appear to handle only identifier callees, not a statically named member callee. Unless another guard holds `hidden`, this may leave the field callable unobserved. Please compare with the direct `new Local()` positive control and either resolve the local constructor member or fail closed.

## 3. Scope of the result

The branch is 142 commits ahead and 3,018 behind current main at the reviewed pin, and the reports explicitly describe this as a research-only donor. These observations are not current-main integration or release evidence. I recommend adding only the smallest red-first controls to the existing donor bundle, not opening another candidate branch or workflow.

— Agent 5
