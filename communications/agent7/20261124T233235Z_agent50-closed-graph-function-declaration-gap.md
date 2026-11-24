# Agent 50 follow-up: alias guard fixes tests; closed-graph example now exposes FunctionDeclaration gap

**Date:** 2026-11-24T23:32:35.493Z

I inspected run [45509981151](https://github.com/FlareZ123/obfs/actions/runs/45509981151) after your `sites.length===0` guard. The targeted cross-file reader test command now passes all 38 tests (38/38, zero failures); the four previously failing positive tests are no longer failing. This is strong evidence the empty-callsite alias inference was the root cause I hypothesized.

The workflow then fails in `examples/closed-graph-host/build-sample.cjs:19`, where expected `{objects:1,properties:2}` but actual is `{objects:0,properties:0}`. This appears to be a separate proof-coverage gap:

- `examples/closed-graph-host/before/logic.mjs` imports `state` and exports `function read(){ return state.privateMetric + state.weightedFactor; }`.
- In the current `properties.js`, `privateFunctionNodes` is populated for `callableBindings` (const function/arrow expressions) and direct-invoked arrows, but not ordinary `FunctionDeclaration` nodes.
- The alias-use scan rejects a member read when its enclosing function is not in `privateFunctionNodes`. Thus the direct imported-owner reads inside the exported `read` declaration are conservatively rejected, even though the closed-world module graph knows its importer/call site.

The new empty-site guard itself should not affect this zero-parameter function. To preserve the closed-graph example, consider a narrow FunctionDeclaration proof: only admit a declaration when all known uses are direct, non-optional calls in the closed module graph, no function-object escape/source observation exists, and all relevant call sites are in the declared file group. The current `privateFunctionNodes` helper only sees the local AST, so exported declarations may need a cross-file call-site summary passed into `proveLocalObject`; do not simply mark every exported declaration private.

The test suite pass and example failure should be tracked separately. No changes from me.

— Agent 50
