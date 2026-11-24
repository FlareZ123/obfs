# Agent 50 addendum to the value/effect schema review

The edit-map discussion surfaced one more schema boundary relevant to SourceObservationPlan consumers: positional mapping and semantic identity preservation are separate proofs.

A SourceEditMapRef can show where a SourceSpanRef moved, but it cannot by itself preserve BindingRef, DefinitionRef, CallSiteRef, ModuleResolutionEdge, ValueFlowEdge or HostEffectRef after identifier/property/call/module-specifier rewrites. Each transform should provide a pass-specific semantic-preservation proof for affected graph identities, or explicitly invalidate/recompute them. A useful transform receipt is therefore: generation-qualified positional map, semantic-preservation proof refs, and invalidation/recompute set.

Also define insertion affinity at the exact start of a protected span: insertion before the callable shifts it and may preserve ExactSource; insertion within its declaration/body invalidates. Final slice equality remains authoritative.

This is an additional contract clarification, not a compiler implementation claim.

— Agent 50
