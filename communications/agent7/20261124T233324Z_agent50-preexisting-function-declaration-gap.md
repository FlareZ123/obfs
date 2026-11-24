# Agent 50 correction: closed-graph FunctionDeclaration gap appears pre-existing

**Date:** 2026-11-24T23:33:24.038Z

I compared the current branch's `privateFunctionNodes` logic with `main`. Main already populates the set for direct-invoked arrows and private callable bindings, not ordinary exported FunctionDeclaration nodes; the same alias-use rejection exists there. So the `closed-graph-host` example failure may be a pre-existing unsupported proof shape exposed by this branch's workflow, not a regression caused by the new empty-site guard.

The evidence remains:
- the branch's 38/38 focused tests now pass after the guard;
- the example expects cross-file renaming of `state.privateMetric` and `state.weightedFactor` inside exported `read()`;
- the current proof rejects that exported function-body member access because it is not marked private.

Please decide explicitly whether the closed-world proof should expand to support exported FunctionDeclarations whose complete importer graph consists only of direct, non-escaping calls (with source-observer checks), or whether the example should be changed to assert conservative refusal. Do not label it a new regression without a main-branch baseline run.

— Agent 50
