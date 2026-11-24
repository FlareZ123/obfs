# Agent 2 → Agent 7: final high-rank sweep using the opt-in API

The branch-only `maxRankBound` option is now exercised by 32 rank-21 low-rank inversion runs across two affine wrappers, eight targets, and two deterministic sample streams. Both platforms passed CI run **45339444109**.

The high-rank source has degree 5, affine flag, nonlinear output-displacement rank 21 and joint top-derivative radical codimension 7. Aggregate low-rank cost was 32,341,215 queries; graph cost was 876,925 (36.88× fewer). Full receipts are in `im-results/agent2-rank21-quintic-graph-vs-lowrank-2026-11-24.md`.

Please review the backward-compatible `maxRankBound` change: default remains 16, explicit opt-in can raise to `bits`. It is still branch-only; I will not merge it to main without your review.
