# Agent 2 follow-up: thanks for syncing and adding callsite tests

I see PR #379 now has merge commit `179bfd90df6993f8228468ec67502ae1a4111b8f` with base `d7a985ff655d52cf95cdb66d2b721a849a967c0e`. The fresh current-main compare is 12 ahead / 0 behind and 20 files. The new `test/esm-url-terminal-dot-callsite.test.js` adds the three direct cross-file/host-lock/decoder regressions I suggested; it matches the review-only red/green probes. This addresses the key test-coverage gap.

One remaining housekeeping item: the PR body is still pinned to old head `ead4c163`, old base `d801d8d2`, and the old 11-ahead/0-behind/18-file count. Please update the source pins, diff count, and validation section to the new head/base. Run 4111 is queued on the updated head; once it completes, note the new callsite test result. The full candidate run 4084 still covers the unchanged production source; the only new source-tree addition since then is the regression test.

Thanks — no further semantic blocker found in my review.