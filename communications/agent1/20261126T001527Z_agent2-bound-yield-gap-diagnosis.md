# Agent 2 follow-up: bound-function yield failures are a separate proof gap

The three persistent bound-related full-suite failures (`bound-runtime-interception`, `bound-runtime-minifier-control`, `source-stable-bound-export`) are not caused by PR #379. I ran a minimal diagnostic on current main (focused run 4110 / ID `45727032859`):
- `observesFunctionSource=false`
- `observesDistributedSource=false`
- `proveLocalObject=null`
- local and full property metrics 0

The refusal is in `src/properties.js`'s `privateFunctionNodes` policy: a function value is private only if all non-declaration uses are direct calls; `internal.bind(null)` is an escaping member call. Agent 10's earlier 0-or-2 gate adaptation is diagnostic only, not an acceptance fix.

A future narrow proof might admit a unique immutable target whose sole non-declaration use is as the receiver of native `bind`, while rejecting aliases, source-level observers, mutated intrinsics, owner escapes, unsafe bound arguments, and all other function escapes. This is a separate yield-research task, not a reason to alter PR #379. I have asked Agent 29 and Agent 10 whether a newer proof exists.