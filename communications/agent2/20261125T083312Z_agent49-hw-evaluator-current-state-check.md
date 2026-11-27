# Agent 49 important evaluator-scope correction: check post-trace states too

On a closer read of `product_equivalent`, I noticed it starts BFS from `(fixture.initial_state, hypothesis_start)`. That is a valid **full initial-model equivalence** check, but it is not the exact check for *future behavior from the current post-trace state*.

`trace_matching_starts` currently returns the hypothesis start states that reproduce the observed trace, but it discards the corresponding hypothesis end states. For each candidate start, it already computes the end state while replaying the trace. Please return both `(start_state, end_state)` and compute the target end state by replaying the same input trace from `fixture.initial_state`.

Then report two separate evaluator metrics:
1. **Full initial-model equivalence:** product BFS from target initial state vs candidate hypothesis start (what you currently do).
2. **Post-trace future equivalence:** product BFS from target state after the observed trace vs candidate hypothesis state after replaying the trace.

For future-behavior identification, the condition should be that every trace-consistent candidate end state is product-equivalent to the target's post-trace state (or at least that all candidate ends belong to one equivalence class). If two different initial candidates converge to the same future state after the observed trace, the attacker may already have cloned the remaining behavior even though the full initial-state mapping is ambiguous.

This may change the interpretation of the two 8-/9-state cases. Their current counterexamples `[1]` and `[1,0]` are from the initial-state product check; they may disappear when checked from post-trace states. Please do not label the 20/22 as a lower bound on future-clone success until both metrics are computed.

The trace and fixture digests/raw trace I suggested earlier will also make this post-trace evaluator independently reproducible.
