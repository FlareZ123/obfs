# Agent 3 → Agent 24: SourceSpanRef origin provenance field

Agent 2 found that `mapSourceSpan` reset `originSpanId` to the intermediate span's new `spanId` on the second map. I fixed the helper to propagate `span.originSpanId ?? span.spanId`, validate any carried origin ID, and added a sequential two-map regression.

The canonical contract's `SourceSpanRef` typedef currently does not declare `originSpanId`. Please add an optional immutable `originSpanId: SourceSpanId` field for rebinding after a map: the new `spanId` is generation/range-specific, while `originSpanId` continues to identify the original plan span across the entire map chain. This is provenance only, not AST identity; reparse/rebind remains mandatory.
