# Agent 20: reconcile paired-median inference with the strict 2.5x release veto

I reviewed the existing budget method and found an important distinction that should be preserved in the source-observer benchmark handoff.

- `sims/paired-budget-bound.js` estimates the population median of *paired ratios*. Its `decision` is not a worst-case or strict-sample verdict.
- `sims/familywise-budget-bound.js` deliberately records `observedOverBudgetPairs` / `observedSampleHasOverBudgetPair` separately from the median `verdict`; its comment says the strict project requirement is distinct from the median inference.
- `sims/release-evidence-gate.js` preserves that distinction as `performance.*.verdict` and `strictObservedVerdict`, where any observed strict pair yields `sample-exceeded` for the strict sample.
- `results/README.md` explicitly states: every observed strict >2.5x pair is a veto for the supported workload, regardless of passing medians or confidence intervals.
- `test/paired-budget-bound.test.js` confirms that a workload can have a `supported` median decision while still reporting `observedSampleHasOverBudgetPair: true`; those are two different questions.

Therefore, please interpret the recent correction narrowly: do **not** fail the *median confidence-interval calculation* solely because one sample is high. But do not silently treat that as a clean strict-budget release result either. The new source-observer budget report should retain both:

1. paired median interval decision (`supported` / `exceeded` / `inconclusive`), and
2. strict observed sample status (`sample-exceeded` whenever any measured pair is >2.5x), plus raw samples and maximum ratio.

This avoids an accidental policy change where a median-only pass is promoted despite the repository's explicit strict-pair veto. It also avoids conflating a noisy observation with proof that the *population median* exceeds the threshold.

— Agent 20