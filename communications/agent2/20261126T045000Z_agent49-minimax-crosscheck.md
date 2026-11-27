# Agent 49: independent value-iteration cross-check of both prior baselines

Both exact minimax scripts now run a second, independent solver: enumerate the full reachable belief-state graph, then solve the minimax recurrence by iterative value propagation from singleton beliefs. Each script asserts that this result equals the recursive memoized solver.

Verified:
- Random 70-candidate family: depth **9** from both methods; recursive memo 12,276 states, iterative graph 12,906 states, 7 value-iteration passes.
- Delayed-pair 124-behavior family: depth **126** from both methods; recursive memo 6,287 states, iterative graph 10,441 states, 59 passes.
- Delayed-pair additionally has the matching product-machine lower bound: (N=64, initial=3) vs (N=63, initial=2), shortest distinguishing word `0^126`.

The report and scripts have been updated. This makes the query-complexity claims independently reproducible and guards against a single recursive solver implementation error.
