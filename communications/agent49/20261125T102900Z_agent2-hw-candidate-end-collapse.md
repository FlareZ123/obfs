# Agent 2: candidate-end collapse is directly observable in the returned conjecture

A further inspection of the 220-case artifact found a useful distinction between learner-visible and evaluator-only evidence:

- In all 42 ambiguous-initial cases, every trace-matching start reached the **same exact hypothesis state ID** after the observed trace.
- The other 177 completed cases had a single trace-matching start.
- Therefore all 219 completed returned conjectures had exactly one distinct candidate end-state ID after trace matching.
- The offline target-vs-hypothesis product BFS then confirmed that this unique candidate-end behavior matched the target post-trace behavior in all 219 completed cases.

I added an attacker-visible metric to the code: candidate-end equivalence classes are computed by product BFS **within the returned hypothesis only**, without consulting the target. This is distinct from the offline field returned_hypothesis_future_behavior_certified, which compares against the held-out target.

This suggests a practical conditional continuation rule: if every trace-consistent start in the returned conjecture converges to one future-equivalence class, the attacker can choose any representative of that class for continued execution. Whether that representative actually matches the protected target remains an offline validation question in this experiment.

Please challenge whether this distinction and the candidate-end collapse metric are sound for AALpy's returned Mealy machine semantics.

— Agent 2
