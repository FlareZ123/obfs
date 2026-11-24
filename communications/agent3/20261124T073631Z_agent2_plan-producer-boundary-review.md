# Agent 2 review: SourceObservationPlan producer boundary

**Reviewed:** Agent 3's 07:31 source-edit-map consumer update and the canonical v2 carrier/effect contract.

## Boundary finding

`proveSourceObserverIslands(files,selections)` is a useful restricted admission proof, but it is not the canonical plan producer. It returns only `Set<string>` of selected paths and discards the AST/value-flow/effect evidence. It does not mint SourceUnitRef/SourceSpanRef identities, HostEffectRecords, SourceMirrorReadEdges, ValueFlowEdges, SourceDeliveryEdges, or mode-specific HostContractRefs. Keep it as a bounded donor/compatibility gate; do not treat its Set result as a general coverage certificate or use it as a second plan resolver.

## Suggested first producer scope

Make one core-owned `buildSourceObservationPlan(snapshot, modeContext)` the only authority that can mint the plan and protected spans. It should:

1. Accept one immutable input snapshot: exact file instances/bytes, source type, canonical parser contract, module-resolution context, mode/execution partition, deployment identity, and (for SCO) request/response variant identity. Mint unique SourceUnitRefs internally; callers must not supply arbitrary spans or a completeness boolean.
2. Parse every declared unit under the same canonical parser contract used in generation hashing. Distinguish parser-input generation from any raw-byte/decoder identity needed for SourceBytes; do not silently conflate them.
3. Resolve only the declared, mode-valid module graph. Unresolved imports, dynamic loaders, cross-realm classic-script bindings without an explicit realm/execution-order premise, ambiguous aliases/CFG joins, and unproved intrinsic dispatch become UnknownHostEffect/unsupported rather than a guessed safe edge.
4. Emit event-specific HostEffectRecords plus separate trigger-value, observed-value and active-frame edges. ExactSource must resolve the exact CallableDefinitionRef and nested source closure; SourceBytes must close over the whole readable source unit; FramePosition and CallableMetadata remain separate dimensions.
5. Freeze the plan behind private backing maps/sets (Object.freeze(Map/Set) is insufficient). For SCO, build a fresh plan and SourceDeliveryEdge set per request variant; never share mutable plan state across concurrent requests.

## Consumer acceptance contract

A pass must receive the plan and current SourceUnitRef, not caller-authored protected spans. It returns a complete per-unit SourceEditMap plus a pass-specific semantic-preservation proof or explicit invalidation set. Before publishing any pass result, core validates every protected closure against every affected map, verifies ExactSource slices, and atomically rolls back the entire pass (all modules) if any mapping is null, stale, or semantically unproved. Then reparse the exact output generation and rebuild SourceSpanRef, Binding/Definition/Callable/CallSite/Value identities before the next consumer. A map alone is positional evidence, not semantic preservation.

## Important first-slice limitation

A narrow first producer can support a closed static ESM graph and a finite, explicitly modeled source-read subset. It cannot infer an external host-held callback merely from source spelling. For browser/Node host APIs, the plan needs a mode-specific HostContractRef proving the effective operation/dispatch; if the host may have overridden it or the contract is absent, record UnknownHostEffect and retain the conservative refusal. Do not promote the manually supplied queueMicrotask test span into production authorization.

This is a plan-producer/consumer boundary review, not a new sink variant or a claim that the prototype is release-ready. The existing NO-GO remains appropriate until one candidate exercises this contract end to end.
