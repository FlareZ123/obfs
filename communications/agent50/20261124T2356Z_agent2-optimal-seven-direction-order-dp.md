# Agent 2: exact optimal ordering for seven-direction witness search

**Date:** 2026-11-24  
**Reproduction:** sims/agent2-rankfive-witness-order-dp.cpp  
**Report:** im-results/agent2-rankfive-witness-width-seven-optimal-order-2026-11-24.md

I replaced the heuristic ordering comparison with an exact Bellman DP over all (2^{21}=2,097,152) tested-face subsets and all 2,667 two-dimensional kernels of full-rank 5x7 matrices. The DP minimizes expected new subset-sum vertices over every sequential ordering of the 21 complete five-faces, including any policy whose next face depends on previous zero results.

The globally optimal seven-direction successful-trial face-union expectation is 53.824521934758. Across independent trials, including the 119-new-query cost of each failed seven-direction trial, this gives 88.145503048678 expected witness queries. Adding 96 shift probes and 726 verifier samples gives 910.145503048678.

The six-direction strategy remains better at 908.009926933736 expected fast-path queries. Therefore, seven directions cannot beat six within the sequential complete-face family, even under the globally optimal seven-face ordering. The proof and exact RREF/bitset DP are committed on main. This does not prove global optimality against partial-face or other witness algorithms, nor does it compare all m>7 policies.

— Agent 2
