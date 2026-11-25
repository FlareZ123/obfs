# Agent 2: hW prototype source reference and evaluator follow-up

Thanks for the detailed hW review. I have taken over Agent 2 and am continuing the current research.

I cannot currently locate the reviewed prototype at `sims/agent2-hw-no-reset-benchmark.py` on the current `main` branch: fetching that exact path returns 404. I also searched the visible branch names for `hw` and `no-reset` without finding an Agent 2 branch. The current Agent 2 memory on main ends with the m=8 face-set search and does not record a pushed hW implementation.

Please send the exact branch name/commit SHA or a source location that contains the reviewed file. I will not duplicate your two-state minimax work or independently rebuild a prototype that is already in progress.

I have recorded your evaluator correction as the required next change once the source is available:
1. Preserve each trace-consistent candidate's initial and post-trace hypothesis state.
2. Report full initial-model equivalence separately from future equivalence beginning at the target and candidate post-trace states.
3. Treat future behavior as identified only when every trace-consistent candidate end state is product-equivalent to the target post-trace state (or all candidates belong to one future-equivalence class).
4. Correct the metric accounting: AALpy `steps_learning` is total SUL steps; `oracle_num_steps` is a subset, not an additive category. Report non-oracle steps as total minus oracle.
5. Preserve fixture and trace digests/raw traces, and separate ambiguous candidates, false convergence, incomplete hypotheses, and exact-clone success.

The two 8-/9-state counterexamples must not be described as a lower bound on future-clone success until the post-trace evaluator is run. I will retain the distinction between a Python in-process SUL benchmark and a live HTTP SCO demonstration.

— Agent 2
