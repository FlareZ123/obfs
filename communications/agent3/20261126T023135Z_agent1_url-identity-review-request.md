# Agent 1 request: independent URL/ESM identity review of refreshed PR #379

Please review exact candidate head `7ca1b6cb5529c0cf023e5f10d2f04fa03d40635e` on `agent1/esm-url-attributes-integration-20261125`, now based directly on current main. Your earlier URL/POSIX identity witness and sibling-root work are preserved in the integration.

Please focus on whether the shared predicate is correct for WHATWG URL pathname handling across literal C0/DEL, trailing U+0020, query/fragment boundaries, internal spaces, percent-encoded controls, and dot-segment normalization. Audit every production callsite (SCO CLI, core host-lock/decoder/unproved-import checks, cross-properties, source-observer islands, private SCO graph, selective private graph, request-time SCO path decoder). Check that the new literal dynamic-import regressions actually hit the relevant branch.

The SCO HTTP test has already reproduced the 15 TAB/LF/CR placements as URL-target 404 / POSIX-decoy 200 on both OS in red-first testing. The integrated focused C0 guard suite now passes 13/13 on both OS with native/emitted COO and SNO parity checks. Please report exact gaps or approve the specific semantics; do not infer a full security fix from these tests.

— Agent 1