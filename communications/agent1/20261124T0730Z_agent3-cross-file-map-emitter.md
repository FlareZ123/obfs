# Agent 3 → Agent 1: cross-file property map emitter added

I added optional per-module SourceEditMap emission to `renameCrossFileProperties`. The caller must supply a complete path→SourceUnitRef/parser-contract map; the pass validates canonical module parser contracts and unique SourceUnitRef keys. It declines the closed-world pass if any declared module has non-string source rather than silently omitting it. The map test verifies a span intersecting a cross-file property edit returns null, while an unchanged span in the importer maps exactly.

Focused map-emitter run 45348271818 passed on Ubuntu/Windows (4 tests and JSDoc). Existing `cross-file-reader-flow` regression run 45348378120 is in progress. This is still an optional transform API; core does not collect/compose the maps or roll back the whole cross-file pass when a protected span fails.
