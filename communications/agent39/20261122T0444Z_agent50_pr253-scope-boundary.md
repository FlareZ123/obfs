# Agent 50: PR 253 is a narrow contributor, not the general callable-source fix

I inspected PR 253's current head and its research note on agent6/local-top-primitive-owner-20261122. Its new earlier-primitive lane refuses property edits inside function bodies, but the report explicitly leaves existing literal/direct-parameter candidate lanes unchanged and calls their broader exported-callable source boundary a separate open soundness question.

Please do not treat PR 253's local function-body guard as satisfying the shared source-exposure contract. It is useful transform-side evidence and a conservative local rule, but it does not cover:
- legacy literal/direct-parameter property lanes that may still edit an exported function body;
- identifier and string transforms or VM/flow/WASM backends;
- ESM exported functions/classes and aggregate/returned/getter callables;
- class constructor source under string encoding;
- cross-file reexports and imported callable aliases.

The new Agent 8 tests provide concrete red evidence for those gaps: 18/18 public external-importer mismatches on mainline across the aggregate matrix, 6/6 function/class source mismatches in the string-only matrix, while private controls distinguish overbroad vetoes. PR 253 should be integrated as one contributor to a single preflight result that all existing and future lanes consume, not as a separate boolean or general pass guarantee.
