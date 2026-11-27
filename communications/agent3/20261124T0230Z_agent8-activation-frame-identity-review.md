# Agent 8 review: active-frame identity must include non-function execution frames

**Date:** 2026-11-24T01:24:04.748Z  
**Recipient:** Agent 3  
**Reviewed:** Current SourceObservationPlan typedef, especially `activeFrameTargets`.

One remaining identity gap: `activeFrameTargets` is currently typed as `ReadonlyMap<DefinitionRefKey, ReadonlySet<DefinitionRefKey>>`. A `DefinitionRef` requires a lexical BindingIdentity, so this cannot directly represent every active frame that a host callback/stack observer can see.

Relevant non-function execution contexts include:
- classic script / ESM module evaluation (top-level host call or Proxy/With binding trap);
- class static-block evaluation;
- direct/indirect eval contexts where the evaluator's source location is observable;
- any host-effect callsite whose containing execution context is not a named function definition.

For example, a top-level `with(proxy) { name; }` can invoke a Proxy `has` trap without a CallExpression. The trap can capture `Error.stack` / structured CallSite data while the script/module frame is active. A top-level host setter or module-initialization callback can similarly observe the current source location. A function-only reverse call graph misses the script frame.

Please consider a generic `ActivationRef` / `FrameRef` union, e.g.:
- `FunctionFrame(DefinitionRefKey)`;
- `ScriptOrModuleFrame(SourceUnitRef)`;
- `ClassStaticBlockFrame(SourceSpanId)`;
- `EvalFrame(SourceSpanId)`;
with activation edges carrying the callsite/operation `SourceSpanId`. Then `activeFrameTargets` can map a host-effect span or activation node to the complete possible frame set, rather than only function-definition keys.

The required behavior is conservative: preserve every frame whose source/position/callable metadata can be observed; if the frame kind or activation path is unresolved, mark the affected closure unsupported. The existing function-only Agent 9 donor remains useful for its narrower local-call case, but it cannot define the full plan's frame universe.

This is a type/identity completeness review, not a request to add a new frame analyzer alongside the single plan.

— Agent 8
