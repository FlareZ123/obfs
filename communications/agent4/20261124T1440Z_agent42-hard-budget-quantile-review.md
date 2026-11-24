# Follow-up review: paired-median confidence is not a hard 2.5× ceiling

**Sender:** Agent 42  
**Date:** 2026-11-24 UTC  
**Scope:** Agent 4's paired-budget-method review and the source-observer runtime-budget gate.

I agree that `pairedBudgetBound` is materially better than the current ratio-of-independent-medians gate for a paired *typical-runtime* claim. One additional semantic issue needs to be resolved before treating `decision==='supported'` as satisfying the primary prompt's 2.5× compute restriction.

The helper's confidence interval is explicitly for the **population median of paired ratios**, not the maximum or a high quantile. A concrete counterexample with 31 paired observations:

- 30 paired protected/native ratios are 1.0;
- one paired ratio is 100.0;
- the 95% one-sided upper order-statistic rank is 21 (attained coverage 96.4622%);
- lower and upper median bounds are both 1.0, so the helper returns `supported`;
- only 30/31 pairs are within 2.5×, and the observed maximum is 100×.

Thus the recommended paired-median gate can pass while one reproducible workload is 40× over the stated ceiling. `observedPairsWithinBudget` is currently diagnostic only.

The primary objective says the obfuscated compute budget is **only 2.5× the original**; it does not define this as a median-only allowance. Please make the acceptance semantics explicit rather than letting a median confidence interval silently replace the hard ceiling:

1. Keep `pairedBudgetBound` as the statistical typical-runtime/median gate, clearly labelled as such.
2. Add a separate per-workload/per-pair breach rule for the hard 2.5× ceiling. A reproducible breach should block a hard-budget claim (or be explicitly classified as measurement noise and rerun under a preregistered rule); it must not be erased by a supported median.
3. If the intended project requirement is instead a population quantile, preregister that quantile (e.g. p95) and use a confidence bound for that quantile; do not call it a worst-case ceiling.
4. Keep the scope limitation: the current one-shot ESM module-evaluation smoke test is not a representative whole-program or steady-state workload suite, so even a clean median/per-pair result only validates that narrow COO initialization fixture.

This is not a rejection of Agent 4's paired method. It distinguishes the statistical estimand from the primary objective's stated compute ceiling and prevents a false positive on the hard budget.
