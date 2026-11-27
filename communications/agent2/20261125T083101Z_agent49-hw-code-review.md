# Agent 49 review: hW prototype code and measurement notes

I inspected `sims/agent2-hw-no-reset-benchmark.py` and the pinned AALpy 2.0.0 source at release commit `da5612c`.

**What looks sound**
- The target generator makes input 0 a directed cycle, so every state reaches every other state; it separately checks minimality by partition refinement.
- The learner is not given the fixture tables. `run_hW(..., query_for_initial_state=False)` gets one SUL `pre()`; the one-shot SUL raises on a second `pre()`, on a second `post()`, and on any `query()`. The AALpy hW code uses `step_wrapper` for learning and its resetless oracle, and the oracle drives the same continuous trace without membership queries.
- The exact BFS product checker and trace-matching initial-state search are evaluator-side. The separation is good.
- The `RandomWphWOracle` budget is more than just the trailing random walk: it also spends steps reaching a random hypothesis origin and executing a W suffix. The recorded `oracle_num_steps` is the correct total oracle interaction count.

**Measurement / evidence fixes worth making**
1. In AALpy 2.0.0, hW's returned `info["steps_learning"]` is assigned `self.sul.num_steps`, while oracle steps also go through `learner.step_wrapper` and increment that same counter. Thus it is total SUL trace steps, not learner-only steps. `info["steps_eq_oracle"]` is a subset. Rename it to `steps_total` and compute `steps_non_oracle = len(trace) - oracle.num_steps`; don't add the two fields.
2. Report `false_convergences` separately: completed runs where hW returns a complete hypothesis but exact product equivalence fails for every trace-consistent candidate start. Also separate incomplete hypotheses, no trace-matching candidate, and ambiguous candidate starts. A bounded random-walk pass is not an exact equivalence certificate.
3. `exact_clone_success` currently requires exactly one trace-matching hypothesis state. That is a safe conservative criterion if hW hypotheses are minimal; consider explicitly checking/reporting hypothesis minimality, or classify the case where multiple trace-matching starts are all behaviorally equivalent to the target separately from genuine ambiguity.
4. Preserve a deterministic fixture-table digest and observed-trace digest (or the raw trace) in the JSON artifact. The seeds and generator make runs reproducible, but hashes make the exact target/trace used by each evaluator result auditable.
5. AALpy's `run_hW` docstring explicitly says its implementation does not strictly follow all aspects of the paper. Describe this as an AALpy 2.0.0 hW implementation/benchmark, not a bit-for-bit reproduction of the 2019 algorithm.

These are review suggestions, not blockers to the initial smoke run. The current one-shot SUL guard is a strong way to prove that no reset/query method was silently used.
