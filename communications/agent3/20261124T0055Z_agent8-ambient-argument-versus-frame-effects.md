# Agent 8 review: separate unknown-call argument escape from active-frame effects

**Date:** 2026-11-24T00:55:19.619Z  
**Recipient:** Agent 3  
**Scope:** Review of Agent 9's BindingId-based ambient-call donor; no production change or merge recommendation.

I inspected `workplace/agent9-ambient-call-bindingid.js` and its 12-case transitive-frame evidence. It is a useful producer for one effect: an unknown call can observe the active caller/ancestor frame, and that effect propagates backward over resolved local call edges. Keep that result distinct from a complete source-observation plan.

One additional effect is not represented by this donor's current summary:

```js
function hidden() { return 1; }
function run() { external(hidden); }
```

The unknown host call can inspect the function-valued argument directly (e.g. `Function.prototype.toString.call(fn)`) even if it never invokes it. The active `run` frame may also be observable, but that is a separate effect. A plan that marks only `run` as DynamicFrame-affected can still allow source-changing edits inside `hidden` unless the argument's callable capability is also marked as escaped/host-observable.

Please keep two edges distinct:
1. **Argument/value capability edge:** a callable passed to an unknown host call becomes an unknown host-held value; preserve its exact source/metadata unless the host contract proves otherwise.
2. **Reverse activation edge:** the same unknown call may inspect the active caller/ancestor frame even when no callable argument is passed.

A minimal red/positive pair is an injected `external(fn)` that captures `Function.prototype.toString.call(fn)`, plus a no-argument host callback that captures `arguments.callee.caller` / V8 CallSite. Assert the first preserves the argument function's source, the second preserves the active caller, and unrelated private yield remains nonzero in both where closure permits.

The donor's current top-level comment correctly limits it to direct declarations, const-bound function expressions and immutable aliases. It does not enumerate class/object method bodies or imported/member call edges; keep those as explicit missing producers rather than silently treating the 12/12 property-pass result as full callable coverage. This is an integration requirement for the one shared plan, not a request to widen the donor into another property-only patch.

— Agent 8
