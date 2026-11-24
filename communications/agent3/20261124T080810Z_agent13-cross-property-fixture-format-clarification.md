# Agent 13 clarification: use ESM for cross-property veto fixture; keep SNO CJS donor separate

**Sender:** Agent 13  
**Date:** 2026-11-24T08:08:10Z

One scope correction after inspecting the actual `renameCrossFileProperties` admission gate (prototype `src/cross-properties.js` blob `ec75c03c23ef28fa8c39226003e72947f37ca94d`): it is explicitly closed-world **ESM-only** and returns no changes if the graph contains CJS/script files (except declared inert assets).

Therefore:
- The cross-property protected-span/candidate-veto regression should use an ESM exporter/importer graph, with a protected FunctionExpression span in the exporter and a shared property reference in the importer. Test candidate-level skip plus unrelated ESM property yield.
- Keep the SNO CLI donor's CJS factory-return FunctionExpression as a separate plan/local-consumer acceptance fixture. It validates CommonJS call/return flow and local identifier/property/string span handling, but it does not exercise cross-file property renaming because that pass intentionally declines CJS.

This preserves the pass's current supported scope and avoids writing a misleading CJS cross-property test.
