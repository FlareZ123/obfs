# Agent 9: mainline comparison for external host-caller property source gap

**Date:** 2026-11-23  
**Disposition:** Confirmed pre-existing mainline contextual source-parity gap; no production code changed.

## Two independent source pins

The same test file, test/agent9-private-property-external-caller-source-witness.test.js, was run against two isolated branches:

| Source | Immutable SHA | Workflow run | Result |
|---|---|---|---|
| PR #357 donor branch | bf637b047e1d86dec658851d405cbe84365f5d6b | [45289188566](https://github.com/FlareZ123/obfs/actions/runs/45289188566) | 3/3 mode cases fail on Ubuntu and Windows |
| Branch created directly from main | 530fbdd355218d44779119aecaed617e1227a9e9 | [45289843259](https://github.com/FlareZ123/obfs/actions/runs/45289843259) | 3/3 mode cases fail on Ubuntu and Windows |

The main-derived branch was created from main at 735604074c97c8702ebbfa6f14401e305083b671 and adds only the witness test. The main src/properties.js file at blob bda3c6097e2679f59bd003fa0aed3e0291d4ba4c contains the same direct-call-only privateFunctionNodes classification and sourceVisibleAncestor gate.

## Exact observed mismatch

For each of COO, SNO, and SCO, on both platforms:

- The original and emitted programs return the same value: 43.
- The host callback captures the running hidden function via arguments.callee.caller.
- Function.prototype.toString on the captured function differs.

Original:

    function hidden(){const owner={secretField:41,otherField:2};getExternal();return owner.secretField+owner.otherField;}

Emitted:

    function hidden(){const owner={"_p2928ab9876":41,"_p2f075957cd":2};getExternal();return owner._p2928ab9876+owner._p2f075957cd;}

The source input itself contains no caller, callee, toString, Error.stack, or other explicit source-reader expression. The observer lives entirely in the host callback injected as getExternal.

## Causal conclusion

Because the exact witness fails on a branch created from current main, this is not a new defect caused by PR #357. It is a baseline weakness in the existing privateFunctionNodes/sourceVisibleAncestor approach, which PR #357 also uses.

The direct-call-only proof establishes only that the function value is not visibly stored, returned, exported, or passed elsewhere in the supplied AST. It does not establish that the active function frame cannot be inspected by an external synchronous callback. The callback can recover the immediate caller through sloppy caller accessors; a V8 Error.prepareStackTrace observer can inspect a wider active stack.

This evidence should not be conflated with the seven incremental regressions caused by PR #357's broad opaque-export fallback. It is a separate, pre-existing source-observation capability gap.

## Integration requirement

The canonical SourceObservationPlan should model ambient caller/stack observation separately from explicit Function#toString expressions and DOM/Web-IDL conversion sinks. Unknown synchronous external calls must either create a possible ambient observer edge, or be covered by an explicit reviewed host contract. If V8 stack reflection is in scope, the effect must propagate to all active frames visible in the captured stack, not only the immediate caller.

The isolated branches preserve the reproduction without adding a deliberately red test to main. This report records the two-platform receipts and the mainline comparison.
