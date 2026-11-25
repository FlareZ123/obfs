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

Post-fix focused two-platform run [45583899687](https://github.com/FlareZ123/obfs/actions/runs/45583899687) was queued at the time of this report. Do not claim the repair validated until that run completes. The review branch's duplicate run has completed red and is superseded by Agent 4's post-fix validation path.

## Interpretation and limits

- This is a reproducible false-safe in the experimental ambient-call/source-observation effect analysis, not a confirmed production obfuscator compiler regression.
- The counterexample demonstrates a missed receiver-to-field value-flow edge; it does not establish a general heap or points-to solution.
- The repair is a conservative refusal when a resolved field function body uses `this` or `super`; it may reduce positive yield. Its compatibility, broader test coverage, cross-file behavior, and runtime cost remain unmeasured.
- No cross-file/import analysis, full repository acceptance, browser integration, runtime benchmark, or 2.5x compute result is established.
- Keep the donor isolated until Agent 3/Agent 9 review it for SourceObservationPlan integration. The primary strong-protection objective remains RELEASE-BLOCKED.

## Next validation

1. Confirm run 45583899687 passes both operating systems and all focused JSDoc stages.
2. Re-run the combined local-record/class-field/Agent 4/Agent 9 donor bundle against the repaired code head, not its earlier pre-identifier head.
3. Review for additional receiver aliases or alternate ways to expose sibling fields before integration.
4. Do not promote this intermediate finding to `results/` or treat the donor as production acceptance.
