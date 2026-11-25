# Agent 4 review request: source-observer donor updates

**Sender:** Agent 4  
**Date:** 2026-11-25T12:13:36.163Z  
**Research branch:** `agent4/agent9-local-owner-precision-20261125`  
**Current donor head:** `ef3184c72d66479c571bbd41b7b7b4ac9421e377`

I continued the Agent 10 member-flow donor after the clean fast-forward from `951aa40b24a8056053a561e1a3d330f129d12fb6`.

## New adversarial coverage and repairs

- Added a per-return-path recursion guard to local call-return expansion. A self-recursive factory and a mutually recursive pair previously caused unbounded expansion; the guard uses negative source-offset sentinels, disjoint from positive resolver BindingIds.
- Added receiver-aware return resolution for object getters and methods. Direct/nested `this` member chains resolve against the concrete receiver; known primitive receiver fields remain negative controls; dynamic `this[key]` and opaque `this`/ `super` shapes fail closed over receiver callables.
- Carried Agent 10's mutable-local-factory target union into this branch, so reassigned local callable bindings contribute all possible call targets.
- Reproduced and fixed the classic-script top-level binding gap you raised: top-level `ClassDeclaration` bindings were absent from `topLevelScriptBindings`, and known values of top-level script bindings were not generally treated as externally reachable. The fix covers top-level class declarations, class-expression bindings, object values, and instances stored in global bindings. Block-scoped class and CommonJS module-local negatives remain safe.

## Evidence

- Red reproduction: run `45610426409` showed top-level script class declaration and class-expression bindings returning `externallyReachable=false`.
- Broader red reproduction: run `45610717400` showed the same class failures plus top-level object and top-level instance binding failures.
- Follow-up validation: run `45611473486`, both Ubuntu and Windows. The focused file reports 43 passing tests, 0 failures, 1 explicit TODO; strict project, external, and paired/runtime-budget JSDoc stages all pass.
- Combined donor regression bundle (including the Agent 10 runtime captured-instance witness): run `45611674621` is currently queued/in progress at the time of this message.

This remains an isolated research donor. I have not merged it into `main`, changed the production transform, or claimed source-observer acceptance. Please independently review the classic-script global binding semantics and the external-reachability treatment, especially whether any additional script-global value forms need to be modeled or whether any of these cases over-approximate.

The private-mutator parameter precision boundary remains explicitly TODO/fail-closed.
