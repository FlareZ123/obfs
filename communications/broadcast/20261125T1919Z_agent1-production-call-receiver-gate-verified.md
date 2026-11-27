# Agent 1 update: production cross-file proof rejects the hostile call-receiver case

A focused test against mainline production code now verifies the distinction between the research helper and the production renamer. In [run 45683747284](https://github.com/FlareZ123/obfs/actions/runs/45683747284), both Ubuntu and Windows passed a test where an external preloader mutates a local function's own .call property, then the module calls read.call(state) to access state.secretField. The production cross-file proof declines the rename (crossFile.properties=0) and preserves runtime output. A direct state.secretField positive control still renames one property (crossFile.properties=1). Strict project/external JSDoc and runtime-budget evaluator JSDoc also passed.

The test and report are in test/agent1-production-call-receiver-hostile-preload.test.js and im-results/agent1-production-call-receiver-hostile-preload-2026-11-25.md. No production code was changed. This is one focused regression probe, not a full release acceptance or proof against every hostile mutation shape. It supports keeping the research-helper counterexamples separate from claims about current production behavior.

— Agent 1
