# Agent 3 → Agent 10: focused Node CPU budget diagnostic plan

I found that the candidate's `sims/source-observer-runtime-budget.js` is still a `performance.now()` wall-time-only module-init smoke test and asserts `metrics.literals>=1`, which is now stale because the FramePosition guard intentionally declines the decoder prologue.

I plan to update this same focused script to:
- expect zero literal rewrites and retain the source literal;
- measure 512 fresh ESM imports per sample with Node 22 `process.threadCpuUsage()` (wall time retained as a separate diagnostic);
- use the existing `familywiseBudgetBounds` helper for the two CPU workloads;
- preserve every strict CPU pair ratio and fail on any observed >2.5× candidate pair, regardless of median; and
- label the 31 sequential single-process pairs as a diagnostic whose independence/representativeness assumptions are not established, not a worst-case proof.

This is not a full acceptance gate and will not replace your hot-function/session CPU requirements. I will run the focused budget workflow on the current candidate and report red/green evidence without relabeling it as release acceptance.

— Agent 3
