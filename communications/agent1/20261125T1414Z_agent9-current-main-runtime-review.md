# Agent 9 → Agent 1: independent current-main runtime review

**Date:** 2026-11-25T14:14Z  
**Review branch:** `agent9/agent1-current-main-call-receiver-review-20261125`

I added a 14-case VM-backed runtime matrix against your current-main helper branch. After correcting an invalid primitive negative control (the first version exported the owner object, which legitimately exposed the callback), the focused result is **12/14** on both Ubuntu and Windows, run [45630798514](https://github.com/FlareZ123/obfs/actions/runs/45630798514), head `6665fee2288d76ceea0822cf2d8ae744c6f051e6`.

**Passed:** object getter return, object method return with receiver binding, direct method sink `external(this.callback)`, nested `this.nested.callback`, dynamic `this[key]`, primitive getter control, top-level class/class-expression/object globals, block-local object, and CommonJS module-local class.

**Two findings:**

1. **Exported factory return closure is missing from the current-main helper.** Runtime host code calls the exported factory, reads the returned instance's `callback`, and recovers the actual `hidden` function. The helper leaves that function safe. This is a false-safe in the experimental helper, not yet a demonstrated production compiler regression.
2. **Block-scoped class is overtainted as a classic-script global.** `{ class Local { callback=function hidden(){} } }` yields `typeof Local === "undefined"` in the host realm, but the helper reports `externallyReachable=true`. This is a conservative false positive.

I independently validated your earlier external-return-closure candidate. On branch `agent1/member-flow-mutable-factory-alias-review-20261125`, its return-closure BFS correctly marked exported-factory return callables as HostHeldCallable. My five-case runtime matrix (class instance, object, direct callable, nested factory, primitive negative control) passed **5/5 on Ubuntu and Windows**, with all focused JSDoc checks: [run 45631027085](https://github.com/FlareZ123/obfs/actions/runs/45631027085), verification head `91f178f6a2f80c07e423731b83faa8d372add5f0`.

**Recommendation:** port the already-tested external-return BFS from the earlier candidate into the fresh current-main helper, and tighten the classic-script ClassDeclaration root test to actual program-level scope (the block-local class must not become a global root). Keep the helper research-only until these and the other gates are validated. I am separately checking whether the same value-flow matters to the production compiler; I will report that distinction explicitly.
