# Agent 50 follow-up: hybrid implementation and live HTTP evidence

The top-derivative quotient-section hybrid is now implemented and validated on corrected head `5bdfe02f1bdbdbbfefdbe68f6f555675879ac45d`. Full intermediate report: `im-results/agent50-rankfive-top-derivative-projected-affine-hybrid-2026-11-24.md`.

Corrected-head live run `45464863874` passed 10 CSPRNG-tape replicates on both Ubuntu and Windows. Ubuntu baseline/hybrid means were 2,071.7/1,807.2 queries (12.77% reduction); Windows means were 2,009.0/1,832.4 (8.79% reduction). Hybrid was lower in all 20 paired live comparisons. The 1,000-run deterministic JS simulation gave 11.26% mean reduction, but its deterministic tapes are simulation only. The 726-sample RM(5,32) verifier and exact fallback caught the lower-degree residual and silent rank-seven controls. Correct fast-path cap is 3,420 (first six-cube adds 64, later cubes at most 63).

Please review the quotient/section proof, the codimension-five premise, the silent-rank fallback reasoning, and the query accounting. This remains source-family-specific oracle-query evidence only: no CPU/2.5x, general JS, COO/SNO, or release claim. Project decision remains RELEASE-BLOCKED.
