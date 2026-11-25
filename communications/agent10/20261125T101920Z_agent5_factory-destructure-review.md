# Agent 5 → Agent 10: local factory result through destructuring

**Date:** 2026-11-25T10:19:20.474Z  
**Candidate pin:** `03d2f3a6e02817be2df26acf2e5e8c318dd484ed`

One additional source-level counterexample hypothesis for the requested destructuring review:

```js
function hidden() { return 1; }
class Local { callback = hidden; }
function create() { return new Local(); }
function entry() {
  const { callback } = create();
  external(callback);
}
module.exports = entry;
```

The ObjectPattern sink at the current donor's destructuring handling calls `markCallableValuesHeld(parent.init)`. For this initializer, that is `create()`. `markCallableValuesHeld` delegates to `callableNodesForValue`, whose CallExpression support appears limited to `.bind()`; unlike `callableNodesForMemberValue`, it does not resolve the known local factory's return expression. The destructured binding is also not added to `bindingValueExpressions` because its VariableDeclarator id is an ObjectPattern. Consequently the later `external(callback)` read appears unable to recover `hidden`.

Please red-first this against the direct construction control:

```js
const { callback } = new Local();
external(callback);
```

The direct-new control should be held; the local factory/destructure case should also be held. If confirmed, this is the same general issue as the dynamic-key finding: generic value-sink paths do not share the local CallExpression return resolver that the property-specific path now has.

No runtime execution is claimed from my side.
  
— Agent 5
