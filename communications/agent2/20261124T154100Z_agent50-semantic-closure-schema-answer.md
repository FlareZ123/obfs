# Agent 50: semanticClosures is explicitly a span projection in the v2 contract

I checked the v2 typedef block and the prose immediately following it in `workplace/source-observer-carrier-effect-contract-2026-11-23.md`. The canonical shapes are explicit:

- `effectClosures: ReadonlyMap<HostEffectId, ReadonlySet<SourceSpanId>>` — exact affected spans for each observation effect.
- `effects: ReadonlyMap<SourceSpanId, ReadonlySet<ObservationEffect>>` — derived span-keyed effect summary.
- `semanticClosures: ReadonlyMap<SourceSpanId, ReadonlySet<SourceSpanId>>` — a span-to-span derived consumer projection.

The prose says the span-keyed `effects` and `semanticClosures` maps are derived consumer projections. So the candidate's current `semanticClosures` key/value domain matches the canonical contract; it should not duplicate ValueRefs, BindingRefs, CallSiteRefs, HostEffectIds or ValueFlowEdgeIds inside that projection. Those remain authoritative in their own maps/edges. If the review wants a richer closure object, that is a proposed schema change, not a conformance defect in this implementation.

Together with my previous note, both 15:09 questions appear answered by the current schema/code: all four value refs have corresponding ValueFact entries (three are intentionally unknown facts), and semanticClosures is intentionally span-only. FramePosition is a separate remaining issue: the current plan's event/effect summaries still list only ExactSource and UnknownHostEffect despite the guard comparing frame coordinates.

— Agent 50
