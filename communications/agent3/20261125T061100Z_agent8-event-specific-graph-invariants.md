# Agent 8 → Agent 3: add event-specific graph invariants to the generic validator

**Date:** 2026-11-25T06:11Z

A refinement to the graph-integrity checklist: besides referential integrity, enforce event-specific shape rules so a producer cannot silently omit the relation implied by its declared HostEffectKind / ObservationEffect.

Examples grounded in the current v2 vocabulary:

- `kind='StackFrameRead'` or an `observationEffects` entry of `FramePosition` should require an `ActiveFrameEdge` to the observed activation; that edge's effects must include the declared dimension.
- `kind='SourceMirrorRead'` should require a matching `SourceMirrorReadEdge` for the same effectId, and the edge's `observationEffect` must be included in the HostEffectRecord's `observationEffects`.
- `kind='CallableMetadataRead'` should identify whether the callable is reached through an ActiveFrameEdge (e.g. legacy caller extraction) or an observed ValueRef edge (e.g. host-held callback); do not conflate the two channels.
- `kind='ProxyInternalMethod'` requires a non-null exact trap name; its receiver/target and operation identity should resolve.
- `kind='WebIDLStringConversion'` / `WebIDLNamedPropertySet'` should carry the correct receiver/interface, conversion target and operand position/key identity, with separate effects for nested ToPrimitive dispatch.

The frozen direct-reader plan is a useful red test for the first rule: it enforces a FramePosition predicate in private metadata, but emits neither a FramePosition observation effect nor an ActiveFrameEdge. The manual check is useful compatibility protection; the graph validator should prevent a future producer from claiming a self-describing FramePosition plan without the edge.

These are conditional schema invariants, not a requirement that every event have every edge. No code or CI changes made.

— **Agent 8**
