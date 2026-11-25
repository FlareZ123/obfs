# Agent 9: runtime witness for captured-instance class-field escape

**Date:** 2026-11-25  
**Status:** reproduced false-safe in Agent 4's class-field donor; independently verified the runtime disclosure; the same witness passes on Agent 10's member-flow donor.  
**Scope:** research-only callable/source-observation analysis. No production compiler source changed.

## Finding

This report supplements, rather than replaces, Agent 10's already documented captured-mutable-instance alias false-safe. The added evidence is an executable runtime witness: the source actually sends the sibling callable to an external host, and the host can recover its source with `Function.prototype.toString`.

Minimal source:

```js
function hidden() { return 1; }

function entry() {
  let owner;
  class Local {
    callback = hidden;
    leak = () => external(owner.callback);
  }
  owner = new Local();
  owner.leak();
}

module.exports = entry;
```

The field closure captures the mutable lexical binding `owner`; it does not contain `ThisExpression` or `Super`. At runtime, `external` receives `hidden`. The field initializer is therefore not self-contained merely because it avoids the explicit instance receiver.

## Red reproduction against Agent 4's original donor

- Donor branch: `agent4/agent9-local-owner-precision-20261125`.
- Donor helper: `workplace/agent9-ambient-call-bindingid.js`, blob `2b6538e11cc1abdd072736a91c6b4e079c138f92`.
- Donor code head recorded in Agent 4's report: `804db5fc908b7ad71a97cc107a4eb5584db0ad07`.
- Donor branch head recorded in Agent 4's report: `84c93ab5ea5ad04c5c80898ec90762bc6639c6fc`.
- Red witness branch: `agent9/agent4-field-capture-red-20261125`.
- Test: `test/agent9-class-field-captured-instance-escape.test.js`, commit `9d2f518a9675eacec3454f80f0544a2e610c2098`.
- Focused run [45604683604](https://github.com/FlareZ123/obfs/actions/runs/45604683604): failed on Ubuntu and Windows. The runtime assertions passed first (host received a function and `Function#toString` returned `function hidden`); the static analysis then reported `hostHeldCallable=false` where the test required `true`.

This matches the root cause already identified by Agent 10 in [the captured-instance alias report](agent10-class-field-captured-instance-alias-escape-2026-11-25.md): the direct `ThisExpression`/`Super` guard does not account for a function field reading the instance through a captured mutable lexical binding. The old MemberExpression path does not follow that binding's assigned instance value into the sibling field.

## Green verification against Agent 10's member-flow donor

I created a verification branch from Agent 10's latest donor snapshot without modifying his branch:

- Base branch: `agent10/member-flow-counterexamples-20261125`.
- Base donor helper blob: `ce55d681d595a3995d93f424ecc603b560830c17`.
- Verification branch: `agent9/agent10-class-field-captured-alias-verify-20261125`.
- Verification commit: `d2a0188eef53e55c397f0c36ddeaf0b8ab5e9ae6`.

Evidence, all on Ubuntu and Windows with Node 22.23.4:

| Run | Scope | Result |
|---|---|---|
| [45605032119](https://github.com/FlareZ123/obfs/actions/runs/45605032119) | Runtime witness plus static effect assertion | Pass on both OSes; project, external and paired-budget JSDoc pass |
| [45605274108](https://github.com/FlareZ123/obfs/actions/runs/45605274108) | Complete 33-case class-field matrix | Pass on both OSes; all focused JSDoc stages pass |
| [45605478954](https://github.com/FlareZ123/obfs/actions/runs/45605478954) | Combined local-record, class-field, ambient-throw/callable and BindingId bundle | **116/116 pass** on Ubuntu; Windows job also passes; all focused JSDoc stages pass |

The 33-case class-field matrix includes the mutable module/function-local alias cases, inline function and arrow field variants, captured object/accessor holder controls, dynamic member keys, destructuring, factory returns, nested member chains, and a negative control where reading a primitive sibling field must not publish an unrelated callable. The 116-case bundle comprises 16 local-record cases, 33 class-field cases, 23 ambient-throw/callable cases, and 44 BindingId cases.

The relevant repair direction in the member-flow donor is property-specific value resolution through mutable binding assignments: `memberValueExpressionsForProperty` follows `bindingValueExpressions`, resolves class instances, and then obtains the selected class field value. This closes the tested captured-instance path without requiring every closure field to be rejected.

## Interpretation and limits

- **Established for these snapshots:** the Agent 4 donor is false-safe for this executable witness; the Agent 10 member-flow donor classifies the same witness as held and passes the focused 33-case and 116-case donor suites on both operating systems.
- **Not established:** arbitrary JavaScript heap/alias soundness, cross-file/import flow, compiler integration, production property-renaming safety, three-mode acceptance, browser hostile-runtime resistance, source secrecy, tamper resistance, or the 2.5x compute budget.
- The Agent 10 branch is still a stale research donor (153 commits ahead / 3,106 behind main at the comparison point) and changes only research helper/tests and related research material; it is not a production `src/` or `bin/` integration.
- The passing focused donor runs do not supersede the repository's current release-blocked decision or constitute a full repository gate.

## Recommended disposition

Keep both donor lines separate from PR #374 and from current production source. Agent 10's member-flow work is a credible candidate for a later, minimal port, but only from a fresh current-main branch after PR #374 receives its own disposition. A production port should carry the captured-instance runtime witness and the 33-case class-field matrix into the mainline regression set, then pass the complete repository gate and separate SCO/COO/SNO adversarial and compute-budget evaluations.

No result is promoted to `results/`.
