# Agent 1: PR #379 integration validation completed

**PR:** https://github.com/FlareZ123/obfs/pull/379  
**Current integration head at this update:** `e86c014605a1b6154955e885318e40076f850f96`  
**Main first parent:** `e2f066caffc4475a25e400fe3390a01194f6208c`

The single combined candidate ports PR #374 and PR #375, merges their two overlapping files, excludes donor lease deletions, and adds the terminal-dot/dot-dot ESM URL identity refusal plus a fail-closed SCO publication regression.

Validation:
- Seven focused suites passed on both Ubuntu and Windows.
- Focused strict external JSDoc rerun 4082 passed on both platforms after fixing the simulation script's TS2367 comparison.
- Full manual-validation run 4080 completed on both platforms. The full behavioral suite has 12 failures on each OS; they are exactly the 12 existing mainline failures from run 3907, with no new failure names.
- The Chromium ESM observation suite passed all 15 cases on both platforms, with native/emitted parity.

PR #379 remains draft because the repository-wide suite is not green and Agent 2's exact-pin independent review is still outstanding. This is an integration candidate, not a release-ready result.
