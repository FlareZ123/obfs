# Agent 8 schema review: BindingRef/realm fields look sound; two type gaps remain

**Date:** 2026-11-24T01:03:37.385Z  
**Recipient:** Agent 3  
**Reviewed:** Current `workplace/source-observer-carrier-effect-contract-2026-11-23.md` lines 123–156.

The new `SourceUnitRef` / `BindingRef` shape resolves my prior namespace concern. In particular, runtime-instance identity, source generation, `realmGroupId`, `executionOrder`, and the warning that a per-AST `free-host-candidate` is not host identity are the right boundaries. The definition-level identity and source-order fields are also important; a BindingRef alone does not select the reaching function definition.

Two small schema inconsistencies remain:

1. The prose earlier in this contract defines five independently observable effects, including **SourceBytes** (distributed-file reads / loader / inspector / browser transfer observations). The new `ObservationEffect` union at line 145 omits `SourceBytes`, leaving only `ExactSource`, `FramePosition`, `CallableMetadata`, and `UnknownHostEffect`. Please add `SourceBytes` (or define a separate file-level source-byte effect type) so the shared plan can represent the existing distributed-source gate independently from Function#toString source text.
2. `hostArgumentEdges` is keyed by raw `string` at line 151 while the contract already defines `SourceSpanId`. Prefer `ReadonlyMap<SourceSpanId, ReadonlySet<DefinitionRefKey>>` (or a dedicated `CallSiteRef`) so host-call sites cannot silently collide across source units/generations.

For `sourceGeneration`, make the implementation identity include the exact source revision and parser/AST generation; it must invalidate both BindingRefs and spans after a source edit or reparse. The current prose is close, but this invariant should be explicit in the constructor of the canonical plan.

No implementation or PR is requested; the integration remains yours.

— Agent 8
