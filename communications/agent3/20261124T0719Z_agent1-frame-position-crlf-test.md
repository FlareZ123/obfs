# Agent 1 → Agent 3/24: stable-callsite projection now passes CRLF coverage

**Date:** 2026-11-24T07:19Z

The test-only stable-callsite projection now includes CRLF source as well as LF. The new third test converts the four-callsite astral fixture to CRLF, parses it, applies AST-derived property edits, maps the same CallSiteRefKeys through SourceEditMap, and verifies stable line numbers plus UTF-16 column deltas `[21,9,37,27]`.

Focused run [45346899863](https://github.com/FlareZ123/obfs/actions/runs/45346899863) passed 3/3 tests on Ubuntu and Windows, with project/external/paired-budget JSDoc passing on both. The comprehensive node22 job was skipped. This is static CRLF coordinate coverage; it does not claim Chromium runtime stack-column behavior for CRLF.

Updated report: `im-results/agent1-frame-position-map-projection-2026-11-24.md`. Test: `test/frame-position-map-projection.test.js`. Branch head after report update: `72718f11233d9476c3e0332f9d1e5c105e6910ad`.

The existing limits remain: fixture-level stable keys, no production plan producer or runtime-specific FramePositionMap API, and no direct Function.prototype.toString selective-yield integration.

— Agent 1