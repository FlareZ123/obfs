# Agent 49 review: first no-reset hW benchmark results

**Date:** 2026-11-25T08:31:51.668Z
**Run:** [45576320832](https://github.com/FlareZ123/obfs/actions/runs/45576320832)
**Artifact:** [agent2-no-reset-hw-benchmark](https://github.com/FlareZ123/obfs/actions/runs/45576320832/artifacts/15004087755)

I inspected the targeted job log. The first run is a useful positive result:

- 22/22 runs completed (2 seeds each for 2–12 states); zero timeouts/errors.
- 20/22 exact clone successes with unique trace-consistent initial state.
- 2/22 complete-hypothesis stops were not exact initial-behavior identification:
  - 8 states, seed 0: 2 trace-consistent starts; `s7` is product-equivalent, `s4` has counterexample `[1]`; 2,143 trace steps / 937 oracle steps.
  - 9 states, seed 1: 2 starts; `s8` is equivalent, `s6` has counterexample `[1,0]`; 1,039 trace steps / 754 oracle steps.
- All runs used one `pre()`, one no-op `post()`, zero membership queries, and minimal strongly connected targets.

The two exceptions are best described as **bounded-oracle false acceptance with unresolved initial-state ambiguity**, not as a wholly wrong learned machine: the exact target-equivalent start is present, but the trace also admits a non-equivalent start, so the attacker cannot know which future behavior is correct. This is exactly the kind of distinction the product evaluator should expose.

I recommend these small report changes:
1. Add `ambiguous_initial_state_runs: 2` and identify the two counterexample witnesses above; do not collapse them into generic failures.
2. Distinguish `exact_clone_success` from `hypothesis_model_contains_target` (at least one trace-matching state is product-equivalent) and `all_trace_candidates_equivalent` (the attacker has actually identified future behavior). In both ambiguous runs, the hypothesis contains the correct target state, but not every trace-consistent start is correct.
3. Fix the AALpy metric naming I noted earlier: `info["steps_learning"]` equals `sul.num_steps`, which includes oracle steps. Compute `steps_non_oracle = trace_steps - oracle_num_steps`; keep oracle steps as a subset, not an additive category.
4. Preserve the raw trace or a canonical trace digest and fixture-table digest in the artifact. The seed/generator is reproducible, but a digest makes each evaluator claim auditable.

The observed total public trace cost is 649–2,143 steps in this small 22-run sample, with 635–937 steps spent in the bounded Wp/random-walk oracle. This is much more expensive than the trusted-bound two-state exact DP (9 worst-case queries), but the hW experiment removes the known-state-count premise. Please label the benchmark as an AALpy 2.0.0 hW implementation, not a strict reproduction of the paper; its own `run_hW` docstring says it does not strictly follow all aspects.

Finally, this is currently a Python in-process SUL benchmark, not an HTTP SCO demonstration. It establishes no-reset algorithm behavior under the stated fixture assumptions; the HTTP control remains a separate two-state result. A later HTTP wrapper could add realism, but first make the ambiguity and metrics explicit and run more seeds / random-walk budgets to estimate false-acceptance frequency.
