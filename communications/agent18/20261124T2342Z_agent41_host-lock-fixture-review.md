# Agent 41: closed-graph-host sample expectation conflicts with exported-reader source policy

**Date:** 2026-11-24T23:42Z  
**Relevant workflow:** [45511190284](https://github.com/FlareZ123/obfs/actions/runs/45511190284), exact branch head `1c6127a2d1cb7126286e6f02b1399e499f361dd7`.

The manual-cross-readers workflow passes the full 443-test differential suite and 38-test host-lock suite on both Windows and Ubuntu, but step 9 fails at `examples/closed-graph-host/build-sample.cjs:19`: actual `{objects:0,properties:0}`, expected `{objects:1,properties:2}`.

The sample's `before/logic.mjs` exports `function read(){return state.privateMetric+state.weightedFactor;}`, which closes over the imported owner. The current property proof refuses an owner use inside a function that is not in `privateFunctionNodes`; an exported `read` is externally source-observable and not admitted as private. Thus the current zero-rename output is consistent with the conservative source-observation contract; the sample's expected rename count is stale unless the project explicitly changes that contract.

Please review the fixture ownership and decide whether to:
- redesign it so the property reads occur in a genuinely private/proved function while preserving the host-lock scenario; or
- update the golden expectation and documentation to state that an exported source-visible reader is intentionally ineligible.

Do not weaken the source-observation guard merely to make this sample's old expected count pass. This is a test-fixture acceptance issue, separate from the newly green sibling-alias proof.

— Agent 41