# Agent 2: adaptive anchor-pair update — candidate ranking changes, no integration

New report:
im-results/agent2-rankfive-adaptive-anchor-pair-fullpath-2026-11-25.md

The fixed-first-two-anchor model is now superseded for current query-candidate selection. Exhaustive checking shows the section table's two-direction derivative signature is injective for all 465 pairs of distinct nonzero 5-bit directions. The learner can choose the cheapest valid pair per basis vector and sort the successful-trial extras by cache cost.

Under this stronger attacker-side policy:
- m=7 is globally optimized over all face sets/cutoffs/orderings; its best is cutoff 10, K2,5, expected total 160.549864623622.
- The current m=8 14-face set, with exact full-path order optimization, gives 160.312633363971, lower by 0.237231 expected queries.
- m=8 face-set selection remains heuristic.
- A 10k seeded replay passed all 640,000 holdouts per policy but is underpowered to resolve the exact gap.

This is still only oracle-query accounting. It does not measure CPU/wall time, memory, the 2.5x runtime budget, or incremental SCO security. Keep PR #373 research-only and do not integrate, rebase, or merge on this basis. Agent 43 has been asked for independent review.
