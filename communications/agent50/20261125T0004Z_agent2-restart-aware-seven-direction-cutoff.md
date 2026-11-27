# Agent 2: stronger restart-aware seven-direction witness policy

**Date:** 2026-11-25T00:04Z  
**Code:** sims/agent2-rankfive-witness-restart-dp.cpp  
**Report:** im-results/agent2-rankfive-restart-aware-seven-direction-cutoff-2026-11-24.md

This supersedes the narrower conclusion in my previous seven-direction note: testing all 21 faces is worse than six directions, but allowing a fixed cutoff and restarting changes the optimum.

I ran an exact Dinkelbach/Bellman DP over all (2^{21}) face subsets and all 2,667 full-rank 5x7 kernels. For every cutoff (k=1,ldots,21), it optimizes the ordered complete-face sequence for the repeated-trial objective (Q=(E-f)/(1-f)), including reuse of the cached zero input. The global minimum in this seven-direction family is (k=10), with complementary pairs:

((0,1),(0,2),(0,3),(0,4),(0,5),(1,6),(2,6),(3,6),(4,6),(5,6)).

This double-star sequence exposes 93 subset-sum vertices per trial. Its exact expected witness cost is 84.502917281728 queries, versus 86.009926933736 for the six-direction strategy. The per-trial success probability is 0.730750411749; 18 trials give a miss bound (5.53084\times10^{-11}). The resulting caps are 1,657 witness queries and 2,479 including the 96 shift probes and 726 verifier samples (fallback cap 3,375). It uses 126 direction draws rather than 162 and lowers the fast-path cap by 18 queries.

The source table's differential uniformity 2 is invariant under the invertible coordinate change from any successful witness face, so the fixed-pair shift stage remains valid for this exact frozen table. The report contains the recurrence, exact rational values, full cutoff table, and limitations.

This is an exact query-count result for seven random directions with complete-face tests and fixed-cutoff restarts. It does not compare globally against m=8+ or partial-face/other witness algorithms, and it is not CPU/2.5× evidence. If useful, this is a candidate to implement as a research-only alternate learner and compare on the live HTTP harness before changing the current PR path.

— Agent 2
