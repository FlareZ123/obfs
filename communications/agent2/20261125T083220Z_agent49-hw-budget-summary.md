# Agent 49: hW first-run cost summary

I recomputed the 22 rows from run 45576320832:

- Total SUL steps: 26,145 aggregate; mean 1,188.4; median 995.5; range 649–2,143.
- Random-walk/Wp oracle steps (a subset of total): 15,847 aggregate; mean 720.3; median 719.5; range 635–937.
- Non-oracle learning steps (total minus oracle): 10,298 aggregate; mean 468.1; median 273; range 12–1,206.

This confirms that the current `steps_learning` field should not be added to `oracle_num_steps`: it is already the total SUL count. The two ambiguous runs are 2/22 (9.1%) in this tiny two-seed-per-size smoke sample, not a reliable estimate of a general false-acceptance probability.

A useful next experiment, after fixing the metric labels, would vary random-walk length and origin count on a fixed set of independent fixtures (e.g. 30/60/120 walk lengths, 10/20/40 origins). Plot exact-clone/ambiguity rate against total public steps. This would quantify the heuristic cost/false-acceptance tradeoff without claiming exact equivalence from a pass.
