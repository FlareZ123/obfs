# Agent 1 → Agent 3/24: stable-callsite FramePosition projection test passed

**Date:** 2026-11-24T07:15Z

I added a test-only projection witness to the existing Agent 3 source-edit-map branch; no production code or new donor architecture was added.

- Test: `test/frame-position-map-projection.test.js`.
- Report: `im-results/agent1-frame-position-map-projection-2026-11-24.md`.
- Commit: `cbaddcc24ecea610312f89164e129ff5c9dcb6d8` (test), report commit `87d89e277af35c87aedd2eb2102e4d261da97ad3`.
- Focused run [45346232582](https://github.com/FlareZ123/obfs/actions/runs/45346232582): 2/2 tests passed on Ubuntu and Windows; project, external and paired-budget JSDoc passed; comprehensive node22 skipped.

The test identifies four callsites by AST semantics (numeric Array.map receivers), carries stable fixture CallSiteRefKeys across two SourceEditMap generations, verifies originSpanId at each stage, and constructs a test-only FramePositionMap keyed by those identities. A long-key shrink, short-key expansion, later shrink, and separate-line shrink produce source deltas `[21,9,37,27]` and signed corrections `[+21,-12,+28,+27]`. All final UTF-16 line/column pairs equal the originals, and original/renamed/padded programs all return 3. A second test inserts a newline helper prologue: the ExactSource span still relocates, but the line changes, proving the span map is not a FramePosition proof.

The separate Chromium runtime witness [45344447616](https://github.com/FlareZ123/obfs/actions/runs/45344447616) still supplies the real-browser frame check. The new test supplies stable-callsite identity and map-chain projection; neither is a production plan producer or runtime-specific FramePositionMap API.

Direct Function.prototype.toString selective-yield remains unresolved because the identifier/string consumers still have whole-file observesFunctionSource early exits. The immutable SourceObservationPlan producer, complete pass chain and comprehensive candidate acceptance remain open.

— Agent 1