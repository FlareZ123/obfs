# Agent 10: identifier-initialized class-field receiver escape

**Date:** 2026-11-25  
**Status:** confirmed donor-analysis false-safe on pre-fix source; post-fix validation pending  
**Scope:** Agent 4's experimental `summarizeAmbientCallEffects` donor only. No production compiler source or release decision changed.

## Finding

The class-field deferral admitted an identifier initializer that resolved to a local function but did not inspect the resolved function body's receiver use. The inline FunctionExpression/ArrowFunctionExpression guard was not sufficient: a regular function stored in an instance field receives the instance as `this` when invoked as `instance.leak()`.

The minimal shape is:

```js
function hidden() { return 1; }
function leak() { external(this.callback); }
class Local {
  callback = hidden;
  leak = leak;
}
function entry() {
  const instance = new Local();
  instance.leak();
}
module.exports = entry;
```

At runtime, `instance.leak()` binds `this` to the instance and `external` receives `instance.callback`, i.e. `hidden`. The effect analysis must therefore mark `hidden` as HostHeldCallable. The previous member-value resolver did not recover a `MemberExpression` rooted at `ThisExpression`: it has no local Identifier receiver binding, so the host-call sink did not find the sibling field's callable.

The same failure occurs when the identifier resolves to a const-bound FunctionExpression.

## Reproduction evidence

1. Agent 4's pre-fix donor commit `2cb8d597146a2821dc662db2505394266c4b3414` added a direct identifier-field receiver control. Focused run [45583648094](https://github.com/FlareZ123/obfs/actions/runs/45583648094) failed on Ubuntu and Windows: 16/17 tests passed, while `a field initializer function that uses this is not deferred through its binding` asserted `hostHeldCallable=false` instead of the required `true`.
2. Independent review branch `agent10/agent4-class-field-identifier-review-20261125`, commit `504d55956193801e7ed9326e84f317c8e7928581`, added two sibling-field cases: a FunctionDeclaration and a const-bound FunctionExpression. Focused run [45583608298](https://github.com/FlareZ123/obfs/actions/runs/45583608298) failed on Ubuntu and Windows: 16/18 tests passed and both new cases failed with the same false-safe classification.
3. The earlier 16-case class-field green [45582981871](https://github.com/FlareZ123/obfs/actions/runs/45582981871) and combined four-suite green [45583159063](https://github.com/FlareZ123/obfs/actions/runs/45583159063) predate the identifier-resolved receiver adversary and do not cover it.

## Donor repair in progress

Agent 4 added `fieldFunctionUsesInstanceReceiver(fn)` in commit `804db5fc908b7ad71a97cc107a4eb5584db0ad07` and changed the Identifier branch of `isSafeClassFieldInitializer` to resolve the function node and scan its body for `ThisExpression` / `Super`. The class-wide admission check uses this helper for every field initializer, so an unsafe identifier field causes the class deferral to fail closed. Agent 4 then added the two sibling-field controls to the donor matrix in commit `4e22431d3a007fe065478a928cb9d59469b87e71`.

Post-fix focused run [45583899687](https://github.com/FlareZ123/obfs/actions/runs/45583899687) completed successfully on Ubuntu and Windows at head `4e22431d3a007fe065478a928cb9d59469b87e71`: all **19/19 class-field tests passed on each OS**, followed by strict project JSDoc, external JSDoc, and paired-budget JSDoc. The sibling-field FunctionDeclaration and const-bound FunctionExpression controls both passed.
  
The repaired head also passed the combined donor regression bundle in [45584385411](https://github.com/FlareZ123/obfs/actions/runs/45584385411): **102/102 tests on Ubuntu and 102/102 on Windows**, with strict project, external, and paired-budget JSDoc stages green. This bundle loads the local-record matrix, class-field matrix, Agent 4 ambient-throw/callable suite, and Agent 9 BindingId suite. The workflow's unfocused Node 22 job is skipped by design for focused dispatch; this is not the full repository gate. The review branch's independent pre-fix run 45583608298 remains a red receipt and was not merged.

## Interpretation and limits

- This is a reproducible false-safe in the experimental ambient-call/source-observation effect analysis, not a confirmed production obfuscator compiler regression.
- The counterexample demonstrates a missed receiver-to-field value-flow edge; it does not establish a general heap or points-to solution.
- The repair is a conservative refusal when a resolved field function body uses `this` or `super`; it may reduce positive yield. Its compatibility, broader test coverage, cross-file behavior, and runtime cost remain unmeasured.
- No cross-file/import analysis, full repository acceptance, browser integration, runtime benchmark, or 2.5x compute result is established.
- Keep the donor isolated until Agent 3/Agent 9 review it for SourceObservationPlan integration. The primary strong-protection objective remains RELEASE-BLOCKED.

## Post-fix disposition and remaining work

- The identifier-receiver false-safe is closed for the two tested shapes by the conservative resolved-function receiver scan. The 19-case class-field matrix and 102-case combined donor bundle are green on Ubuntu and Windows with focused JSDoc.
- These receipts validate only the isolated donor branch and these suites. They do not validate the production compiler, SourceObservationPlan integration, full repository behavior, cross-file value flow, browser behavior, or the 2.5x compute budget.
- Agent 3/Agent 9 should review the shared effect contract and additional receiver/alias paths before any integration. Keep the donor isolated until that review and a current-main integration plan exist.
- Do not promote this intermediate finding to `results/` or treat the donor as production acceptance. The primary strong-protection objective remains RELEASE-BLOCKED.
