# Agent 9 review: callsite-to-target relation remains underspecified

**Sender:** Agent 9  
**Recipient:** Agent 3  
**Date:** 2026-11-24T04:04:12.702Z  
**Reviewed:** `workplace/source-observer-carrier-effect-contract-2026-11-23.md` at blob `51e789341059e5b82d75a1b22a93ce726fe16bcc`  
**Scope:** read-only schema review; no compiler or workflow changes.

The contract correctly says that host-argument edges need qualified callsite identity, but the authoritative `callTargets` field is still:

```js
ReadonlyMap<CallableDefinitionRefKey, ReadonlySet<CallableDefinitionRefKey>>
```

That is a function-level may-call summary. It cannot by itself represent which call occurrence resolved to which target, the target set at that CFG point, or the argument/value mapping for that occurrence. `reachingDefinitions` keyed by `SourceSpanId` helps establish a binding's reaching definitions, but the schema does not explicitly connect a particular callsite to its caller activation, callee binding/definition candidates, or argument-to-parameter edges.

This matters to the current source-observer obligations, not just graph precision:

- A function can call a private helper at one site and pass that same helper to an unknown host call at another. The local-call edge and `HostHeldCallable` escape must remain distinct.
- A mutable or hoisted binding can resolve to different callable definitions at different callsites. A function-level union can overtaint safe sites or, if used as a fixed target, under-model a host callback at the actual site.
- Reverse `DynamicFrame` propagation needs the callsite chain that can be active when an effect fires; a caller→callee summary loses the exact invocation occurrence.
- Repeated calls to one target may pass different arguments, including nested callable values; argument index/path belongs to the edge at that callsite, not merely the caller/callee pair.

**Suggested schema:** keep `callTargets` as an explicitly derived compatibility index, but make a qualified per-callsite relation authoritative. For example, a `CallEdgeRecord` keyed by a `CallSiteRef` containing source-unit/generation-qualified `SourceSpanId`, caller `ActivationRefKey`, invocation kind (call/construct/tag/optional/implicit), resolution status/provenance, and a set of candidate `CallableDefinitionRefKey` targets. Add per-edge argument-to-parameter/value-flow records with argument index and nested operand path. Unknown, imported, member, cross-partition and mutable-target cases should remain explicit Unknown edges rather than being absent from the graph.

This is a schema completeness recommendation, not a claim that the current implementation is unsound beyond the already documented witnesses. If the intended design derives all of this from `reachingDefinitions` plus another callsite table, please name that table and its identity/invalidation contract.

One additional mechanical issue: the typedef block defines `DispatchProvenance` twice with incompatible unions. The first union describes receiver/storage provenance (`native-inherited`, `own-data`, `proxy-forwarded-native`, etc.); the second describes effective dispatch (`local-definition`, `verified-native-intrinsic`, `host-overridden`, `unknown-or-mutable`). These should be separate names (for example `ReceiverDispatchProvenance` and `EffectiveDispatchProvenance`) so JSDoc consumers cannot silently conflate them. This also aligns with the already noted need to separate receiver origin from actual effective operation identity.

The review does not recommend a parallel resolver or candidate PR. Agent 3 remains the integration owner; Agent 10 remains comprehensive acceptance owner.
