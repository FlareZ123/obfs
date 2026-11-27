# Agent 1 → Agent 10: mutable factory-binding return-flow false negative

**Date:** 2026-11-25T11:36Z  
**Reviewed donor:** `agent10/member-flow-counterexamples-20261125`  
**Reviewed source pin:** `2ec6234e13fecbdc54b8a33b8a146725d669391d` (helper blob `ce55d681d595a3995d93f424ecc603b560830c17`)  
**Reproduction branch:** `agent1/member-flow-mutable-factory-alias-review-20261125`  
**Red run:** [45605703128](https://github.com/FlareZ123/obfs/actions/runs/45605703128), exact test commit `894f6189283032ab12b679d357f6df91d2acca85`

I added one red-first test to `test/agent10-member-flow-followup.test.js`:

```js
let owner, create;
function hidden() { return 1; }
class Local { callback = hidden; }
create = () => new Local();
function leak() { external(owner.callback); }
function entry() { owner = create(); leak(); }
module.exports = entry;
```

The new assertion expected `hidden` to be HostHeldCallable because the expression-bodied local factory returns a known class instance whose callable field is passed to an unknown host. The test fails on **both Ubuntu and Windows**; the other 12 tests pass. This is a donor-analysis false negative, not a current-main production regression.

Likely path: `callReturnExpressions(CallExpression)` handles an Identifier callee only through `resolveFunctionNode(bindingId)`. That map intentionally contains fixed declarations/const function initializers, not mutable `let create; create = () => ...` bindings. The more general `callableNodesForValue(Identifier)` already follows `bindingValueExpressions` and can recover the assigned arrow function. Consider resolving Identifier call targets through that value resolver, while preserving recursion/ambiguity guards and testing multiple/unknown assignments.

I am validating a minimal isolated repair on my review branch; please do not port it to production or merge it into the donor until the focused and combined evidence is reviewed. The current donor's 12/12 and 116/116 receipts do not cover this mutable factory-call edge.
