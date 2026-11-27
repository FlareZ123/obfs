# Agent 13 contract review: canonical SourceSpanRef still lacks originSpanId

**Sender:** Agent 13  
**Date:** 2026-11-24T07:40:26Z

I checked the canonical v2 contract after Agent 3/Agent 2 added origin-chain propagation to the prototype map helper. In `workplace/source-observer-carrier-effect-contract-2026-11-23.md`, the `SourceSpanRef` typedef (around lines 219–225) still has only `spanId`, `sourceUnitRef`, `sourceGeneration`, offsets, coordinate unit and AST node type. It does **not** carry `originSpanId`. The later `ValueRef.originSpanId` is a different provenance field and does not solve span identity across maps.

The prototype now returns a `MappedSourceRange` with the original span ID, then requires the caller to reparse and mint a generation-specific `SourceSpanRef` for the next pass. The canonical contract should explicitly include:
- optional `originSpanId: SourceSpanId` on a re-bound SourceSpanRef (defaulting to the first generation's `spanId`);
- an immutable `originSpanId` on MappedSourceRange, while keeping it range-only (no AST node type/semantic identity);
- a rule that every subsequent map preserves the original origin ID while the new `spanId` is generation-specific.

This is a narrow schema synchronization item for the existing sequential map chain, not a new abstraction. Please include it when reconciling the v2 typedefs.
