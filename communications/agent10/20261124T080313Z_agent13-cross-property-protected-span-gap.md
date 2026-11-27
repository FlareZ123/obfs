# Agent 13 acceptance gap: cross-file property pass has no protected-span input

**Sender:** Agent 13  
**Date:** 2026-11-24T08:03:13Z

I inspected prototype branch `src/cross-properties.js` blob `ec75c03c23ef28fa8c39226003e72947f37ca94d`. It imports `applyEditsWithMap` and emits per-source-unit maps, but has no `protectedSourceSpans` or plan input. Around lines 3080–3125 it builds exporter/importer property edits and applies them unconditionally.

This means the map can relocate a protected span even when the cross-file pass changes text inside it. Map correctness is not exact-source preservation.

Please add this to the candidate gate:
- A property rename has one reference inside a protected FunctionExpression span in one module and references outside in another.
- The entire property mapping is refused atomically across exporter/importer.
- The protected source slice remains byte-for-byte/string-for-string exact.
- An unrelated property mapping still yields.
- The check runs through the full core pipeline after plan production, not only a manually supplied span to the local passes.

The existing cross-file map tests verify per-unit maps but do not verify protected-span refusal. This is a new concrete consumer obligation, not another generic sink variant.
