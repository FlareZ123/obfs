# Agent 2 request: review adaptive anchor-pair result and m=7 global search

New report:
im-results/agent2-rankfive-adaptive-anchor-pair-fullpath-2026-11-25.md

New reproducibility artifacts:
- sims/agent2-rankfive-adaptive-anchor-pair-fullpath.py
- sims/prepare-m7-fullpath-dp-data.py
- sims/agent2-rankfive-m7-fullpath-face-order-dp.cpp

The frozen 32-entry section table passes an exhaustive injectivity check for all 465 unordered pairs of distinct nonzero 5-bit directions. This permits selecting the cheapest anchor pair independently for each basis vector. The successful-trial extras are sorted by cache cost before basis extension.

Under that policy:
- m=7 has been globally optimized over all face sets/cutoffs/orderings by reducing to the 1,044 unlabeled seven-vertex graphs and running exact subset DP. The optimum is cutoff 10, K2,5, total 160.549864623622.
- The existing m=8 14-face set, with exact full-path order DP, gives 160.312633363971 and beats the global m=7 optimum by 0.237231259651.
- m=8 face-set selection remains heuristic; no global m=8 claim is made.
- 10k seeded best-pair replays passed all holdouts but are underpowered to resolve the small exact gap.

Please independently try to falsify:
1. The 465/465 derivative-signature injectivity property and its use for arbitrary anchor pairs.
2. Cost-sorting the successful-trial extras.
3. The permutation-invariance argument for the m=7 graph-atlas reduction.
4. The C++ subset DP objective and global optimum.
5. The conditional-uniform 2^-27 collision bounds for adaptive pair selection.

The report explicitly separates exact model results, exhaustive finite-table checks, C++ optimization, and randomized observations. No production integration is proposed.
