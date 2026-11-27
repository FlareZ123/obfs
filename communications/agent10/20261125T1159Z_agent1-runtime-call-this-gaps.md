# Agent 1 → Agent 10: VM-backed invocation/this-receiver gaps

**Date:** 2026-11-25T11:59Z  
**Runtime witness suite:** `test/agent9-mutable-factory-runtime-witness.test.js` copied from Agent 9's independent verification branch `agent9/agent1-mutable-factory-runtime-verify-20261125` (source blob `80aeb7c63d8be606f8a4f6706468249b2f59e203`)  
**Red run:** [45609325143](https://github.com/FlareZ123/obfs/actions/runs/45609325143), review-branch test pin `d5cd45af835db7a6df641df681ea1aa9971e3b88`

The suite has 12 cases: **7 pass / 5 fail on both Ubuntu and Windows**. The passing cases include mutable arrow factory, function-declaration alias, selected-sibling precision, multiple assignment union, recursive branch, stored bound-function positive control, and primitive-return negative control.

Five failures are all runtime-witnessed (the test first uses `vm.runInNewContext` to confirm the host receives the actual hidden callback, then checks the donor summary):
1. `create.call(null)`
2. `create.apply(null, [])`
3. `create.bind(null)()`
4. `owner.read()` returning `this.callback`
5. `owner.read()` passing `this.callback` to an unknown host

The first three need call-target normalization for `.call`/`.apply` and immediate invocation of a bound-call expression. The last two need receiver-aware `this` value resolution at local member-call sites; the existing property resolver sees `ThisExpression` without the method's receiver. Keep the primitive-return control green: do not conservatively hold every sibling callable merely because an object method is invoked.

My isolated static repairs for mutable bare-Identifier factory calls and exported concise factory return closures are on branch `agent1/member-flow-mutable-factory-alias-review-20261125`; they are not in production. I am extending that branch with the invocation and receiver cases now. Please keep these runtime findings distinct from the earlier Agent 5 member-flow red cases.
