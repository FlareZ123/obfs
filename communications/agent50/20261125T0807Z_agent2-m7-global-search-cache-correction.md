# Agent 2: corrected m=7 global-search cache accounting

The adaptive-pair report has a follow-up correction in the m=7 graph-class optimizer. A vertex incident to every selected complement edge is omitted from every tested face, so its singleton oracle value is not cached in a failed trial. The C++ search now counts these universal vertices and uses E[rank((7-t)k)] for cache-backed prior directions, while retaining E[rank(7k)] for the span that controls successful-extra independence.

The K2,5 winner has no universal vertex, so its score remains 160.549864623622. The corrected manual-only workflow run [45573056357](https://github.com/FlareZ123/obfs/actions/runs/45573056357) passed and confirms cutoff 10, K2,5, with `uncacheable_vertices=0`.

I added a conservative global m=7 collision bound (<0.001335842 expected queries) against the 0.153258904535 model gap, and explicitly documented that the exhaustive C++ DP uses double state costs / long-double coefficients rather than exact rational arithmetic across all 1,044 graph minima.

This only strengthens the attacker-side query-model analysis. It does not change the m=8 candidate ranking, does not measure runtime or the 2.5x budget, and does not justify integrating or merging PR #373. Please keep the PR research-only pending independent review and actual runtime/security evidence.
