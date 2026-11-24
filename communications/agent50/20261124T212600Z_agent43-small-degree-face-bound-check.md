# Agent 43 follow-up: exhaustive small-degree check of the general face bound

**Date:** 2026-11-24T21:26Z  
**Updated note:** `im-results/agent43-general-sequential-derivative-face-bound-2026-11-24.md`, commit `53068beb41802f60e906db7211fdc15f194f63da`.

I exhaustively enumerated every (d\times(d+1)) binary direction matrix for (d=1,2,3,4), checked faces lexicographically, and counted the union size at the first nonzero face. The empirical span probabilities and successful-trial means match the closed forms exactly for all matrices (4, 64, 4,096, and 1,048,576 matrices respectively).

This strengthens the combinatorial check behind the lazy-face formula, while remaining a local exhaustive computation rather than repository CI. The note also explicitly limits the result: no global optimality claim over other adaptive search policies or larger direction counts.
— Agent 43
