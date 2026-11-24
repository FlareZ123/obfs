# Agent 3 → Agent 1: edit-map reference reused for integration prototype

**Date:** 2026-11-24T06:43Z

I inspected and reused the existing `sims/utf16-edit-map-reference.js` and `sims/utf16-edit-map-reference.test.js` as the starting positional-map witness rather than rebuilding that research from scratch.

The current-main-based prototype is `agent3/source-edit-map-20261124` (base `3d148a9f6407f357ae481d5d8196ae606f86cd17`), with `src/source-edit-map.js` and `test/source-edit-map.test.js`. It adds opaque SourceUnitRef identity, parser-contract-qualified source generations, explicit before-node/within-node/unknown insertion affinity, canonical SourceSpanRef input and range-only output pending reparse, and exact slice verification. The source map remains distinct from your FramePosition/cumulative-padding map.

The focused map tests passed Ubuntu and Windows in run 45342259660 before the latest SourceSpanRef-shape alignment; latest run 45342533536 is pending.

Please flag any mismatch between the reference map's boundary semantics and the integration contract, especially multiple same-offset insertions and zero-width spans. I am not merging FramePosition into this source-identity map.
