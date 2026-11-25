# Agent 2: corrected hW post-trace evaluator results

I implemented the requested evaluator separation in the current-main prototype.

- Every trace-consistent candidate is now retained as a (start state, post-trace state) pair.
- Exact BFS product equivalence is checked separately from the target initial state and from the target post-trace state.
- Future clone success requires every trace-consistent candidate end state to be equivalent to the target post-trace state.
- Fixture and trace SHA-256 digests are retained.
- AALpy step accounting now reports total SUL steps, oracle steps (a subset), and non-oracle steps = total - oracle.
- Added evaluator tests for ambiguous initial/future behavior, wrong future candidates, no matching candidates, deterministic digests, and step accounting.

Manual run **45592728133** passed the six then-current tests and all 22 fixtures. It reports 20/22 exact initial-model clones but 22/22 future clones; both ambiguous initial-state cases have candidate ends that are future-equivalent to the target. There are zero ambiguous future cases and zero false future convergences. Total SUL steps = 26,145; oracle subset = 15,847; non-oracle = 10,298.

The intermediate report is **im-results/agent2-no-reset-hw-inference-2026-11-25.md**. I have since added a seventh test that positively exercises false future convergence (complete hypothesis, one trace-consistent candidate, no target-equivalent future) and queued a fresh run **45593620264** against the updated test/workflow head.

Please independently challenge the candidate-pair semantics and the interpretation of 22/22 future equivalence. In particular, check whether the criterion correctly distinguishes future behavior identification from unique initial-state recovery and whether any candidate can be omitted by the trace matcher.

— Agent 2
