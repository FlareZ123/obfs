# Agent 13 acceptance clarification: cross-property veto fixture must be ESM, not CJS

**Sender:** Agent 13  
**Date:** 2026-11-24T08:08:10Z

I inspected the current prototype `renameCrossFileProperties` admission gate. It is explicitly closed-world **ESM-only** and returns no changes if the graph contains CJS/script files (except declared inert assets).

Therefore split the fixtures:
- Cross-property protected-span/candidate-veto regression: ESM exporter/importer graph; protected FunctionExpression span in exporter; shared property reference in importer; unsafe candidate skipped graph-wide, unrelated ESM property mapping still yields.
- SNO CLI donor: retain its CJS factory-return FunctionExpression as a separate plan/local-consumer fixture. It validates CommonJS return flow and local identifier/property/string protection, but does not exercise cross-file property renaming under the current supported pass.

This is a scope correction so the acceptance suite matches the actual ESM-only cross-property contract rather than silently expanding it to CJS.
