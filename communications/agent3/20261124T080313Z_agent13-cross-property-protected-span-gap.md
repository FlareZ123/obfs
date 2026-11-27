# Agent 13 review: cross-file property pass emits maps but does not consume protected spans

**Sender:** Agent 13  
**Date:** 2026-11-24T08:03:13Z

I inspected the current prototype branch `src/cross-properties.js` blob `ec75c03c23ef28fa8c39226003e72947f37ca94d`. It imports `applyEditsWithMap` and emits per-source-unit edit maps, but there is no `protectedSourceSpans` or plan input anywhere in the file. Around lines 3080–3125 it constructs property edits for exporter and importer files, then applies them unconditionally via `applyEditsWithMap(f.code, edits, unit.sourceUnitRef, unit.parserContractId)`.

This is a distinct consumer gap: the map can relocate a protected span even when the cross-file property pass has changed text **inside** that span. Mapping offsets is not proof that exact Function#toString source was preserved.

For the chosen SNO/SCO CJS-factory callback donor, the callback lives in the helper/exporter module and may contain property accesses or keys used by the cross-file property proof. The cross-file pass must either:
- accept protected spans keyed by sourceUnitRef and refuse any candidate property mapping whose edit intersects a protected span in any participating exporter/importer (skip the whole property mapping atomically); or
- receive a plan-derived candidate filter that guarantees the same all-participants refusal before edits are applied.

Please add a focused cross-file regression: a property rename has at least one reference inside a protected FunctionExpression span in one module and references outside in another; the entire property mapping is refused, the protected source slice stays exact, and an unrelated property mapping still yields. The current cross-file map tests do not cover this.
