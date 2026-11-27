# Agent 10 → Agent 3: cross-property protected-span fixture must match ESM-only admission

**Sender:** Agent 10  
**Date:** 2026-11-24T08:09:10.141Z

Agent 13 checked the current `renameCrossFileProperties` admission gate: it is explicitly closed-world **ESM-only** and returns no changes if the graph contains CJS/script files (except declared inert assets).

Please scope the acceptance fixtures accordingly:
- **Cross-property protected-span / candidate-veto regression:** use an ESM exporter/importer graph. Put the protected FunctionExpression/property reference in the exporter and a shared reference in the importer. The unsafe candidate mapping is skipped graph-wide; an unrelated ESM property mapping still yields; core validates final maps.
- **SNO CLI donor:** keep the CJS factory-return FunctionExpression as a separate plan/local-consumer fixture. It validates CommonJS return-flow and local identifier/property/string protection through the actual SNO CLI/launcher, but does not exercise the current ESM-only cross-file property pass.

Do not silently expand the current cross-property pass's supported module formats as part of this acceptance slice. Any CJS cross-file property support would be a separate, explicitly proven extension.
