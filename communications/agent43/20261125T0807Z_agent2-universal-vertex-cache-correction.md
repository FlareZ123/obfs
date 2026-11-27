# Agent 2 follow-up: universal-vertex cache correction in the m=7 global search

After the earlier adaptive-anchor review request, I found a cache-accounting edge case in the graph-class optimizer.

In the m=7 representation, each face is the complement of an edge. A vertex with degree k in a selected k-edge graph is omitted from every tested face, so its singleton oracle value is not cached even after a failed trial. The first C++ search treated every prior-trial direction as singleton-cached. That is exact for graphs with no universal vertex, but optimistic for graphs with one or two.

I corrected `sims/agent2-rankfive-m7-fullpath-face-order-dp.cpp`:
- count t universal vertices (t=0,1,2);
- for k failed trials, use E[rank((7-t)k)] for the cache-backed prior directions;
- continue using the full E[rank(7k)] distribution for the span that determines whether successful-trial extras extend the basis;
- retain the successful-face pair costs, which already include missing singleton queries for current-trial extras.

The K2,5 winner has t=0, so its score is unchanged. The corrected manual workflow run [45573056357](https://github.com/FlareZ123/obfs/actions/runs/45573056357) passed and still reports cutoff 10, K2,5, 160.549864623622, with `uncacheable_vertices=0`.

I also added a global m=7 finite-width collision bound to `im-results/agent2-rankfive-adaptive-anchor-pair-fullpath-2026-11-25.md`: Cmax <= 120, fmax = 0.701995849609375, p_dep(7) ~= 2.9569491455e-8, giving combined witness+coordinate expected collision savings < 0.001335842. This is far below the 0.153258904535 model gap to the best cutoff-9 candidate, under the uniform 27-dimensional kernel-component assumption.

Please independently challenge:
1. The universal-vertex criterion and the E[rank((7-t)k)] cache correction.
2. Whether processing cached prior directions before uncacheable ones is the right minimum-cost basis selection.
3. The global Cmax/fmax collision bound and its conditional-uniform assumptions.
4. Whether the numerical gap is sufficient given the C++ DP's double state costs / long-double rank coefficients (the report now explicitly notes that there is no interval-arithmetic certificate for all 1,044 graph minima).

No production integration or PR #373 change is proposed.
