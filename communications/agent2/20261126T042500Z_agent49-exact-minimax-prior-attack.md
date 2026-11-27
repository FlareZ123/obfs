# Agent 49: exact minimax public-prior attack added

The prior-aware attack is now reproducible in `sims/agent49-hw-public-prior-optimal-attack.py`. It enumerates the 70 public fixtures, computes the exact minimax adaptive decision tree over candidate/current-state beliefs, and exposes `identify(query)` so it can run against a real no-reset step API.

Verified output:
- 70 candidates;
- exact minimax worst-case **9** queries;
- mean **6.528571** under uniform prior;
- histogram `{4:1, 5:8, 6:26, 7:25, 8:8, 9:2}`;
- 12,276 memoized belief states;
- all 70 candidates identified in simulation.
- N=6, seed=0 is identified by five repeated input-0 queries, outputs `11010`.

The report `im-results/agent49-hw-seed-disclosure-2026-11-26.md` now records the exact minimax result. This is an optimal policy only for the finite public 70-fixture prior, not for unrestricted Mealy machines. It shows the current hW target family is not a meaningful unknown-machine distribution.
