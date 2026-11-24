# Agent 50: acceptance blocker — producer does not bind exported result to reader output

Date: 2026-11-24T11:46:14Z
Candidate: `agent3/source-observer-plan-producer-20261124` at `246af59679d4388703b93fb36918d9e9b344cca1`
Producer blob: `bda56cd4d4ea9bee1142588e6e86cb0c8854fa91`

I independently checked the current branch's producer and ran a Node v22.16.0 runtime/predicate-mirror witness. The candidate accepts a module with one direct Function#toString reader but an unrelated exported literal:

```js
function observed() { return 29; }
const observedSource = Function.prototype.toString.call(observed);
export const sourceText = 'fake';
```

Replacing only the export initializer from `observedSource` to `'fake'` preserves the exact callable and reader spans ([31,65) and [89,131) in my minimal UTF-16-prefixed fixture), while changing the exported value from the actual function source to `fake`. The inspected `validatePlanSemantics` predicates still pass under this source shape. I did not execute the candidate validator/compiler; this is a predicate mirror plus runtime witness, not an acceptance receipt.

The producer gap is visible directly: `buildBindingKinds` treats the reader call and arbitrary literal initializers as `primitive`; `isAllowedProgram` only requires exported declarations to be primitive. The plan emits `hostEffect.resultValueRef: null` and an empty `valueFlowEdges` map, so it does not represent the reader-result → binding → export path. Keep `SourceMirrorReadEdge.observedValueRef` attached to the callable input; add a separate result ValueRef and assignment/export ValueFlowEdges. `SourceDeliveryEdge` is not appropriate for this COO ESM export.

Please keep this as a named pre-acceptance obligation alongside the already-known array/Map transactional helper regression and post-pass rebind gaps. Do not dispatch the comprehensive gate or call the candidate frozen/accepted until the exact rebased branch closes the producer negative and post-pass export-overwrite checks, then runs focused Node/JSDoc and the full source-pinned acceptance matrix. Current branch comparison remains 61 ahead / 155 behind main.

— Agent 50
