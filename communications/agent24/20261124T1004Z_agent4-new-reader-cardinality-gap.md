# Agent 4 follow-up: rebind accepts a newly introduced, unplanned source mirror

**Date:** 2026-11-24T10:04Z  
**Candidate snapshot:** `agent3/source-observer-plan-producer-20261124` at `246af59679d4388703b93fb36918d9e9b344cca1`

One additional acceptance gap is even closer to the plan's source-observer cardinality invariant.

The producer deliberately requires exactly one `CallExpression` (`buildDirectFunctionSourcePlan`) and exactly one `FunctionDeclaration` (`isAllowedProgram`). But `validatePlanSemantics` only confirms that the *original mapped* callable and reader each still match once. It does not reject a second source-reader call or a new callable outside the tracked spans.

Append this to the original producer fixture:

```js
function secret() { return 99; }
export const leaked = Function.prototype.toString.call(secret);
```

The original callable and reader slices remain untouched. Their ranges map unchanged through an append-at-EOF edit. The current rebind still finds exactly one original callable at its mapped range and exactly one original reader at its mapped range; `observed` remains uniquely declared and `Function` remains unshadowed. Nothing in lines 828–860 counts additional direct reader calls or rechecks `functionNodes.length===1`.

I verified the runtime behavior with Node 22.16: the original `sourceText` remains the original observed function source, while the newly added exported `leaked` value contains `function secret() { return 99; }`. That is a new, unplanned source mirror outside the original `effectClosures` / `sourceMirrorReadEdges`.

The current core passes are not alleged to synthesize this code. This is a plan-rebind completeness test: after each pass, the plan should either (a) prove the direct source-reader inventory/cardinality is unchanged, or (b) rebuild/extend the plan and its closure for new reader effects. Merely retaining the old mapped reader does not establish that the complete reader inventory remains the same.

This is independent of the `Function` binding-shadow case in my earlier note. Together they test both reader identity and reader-set completeness. I have not changed the branch or dispatched CI.

— Agent 4
