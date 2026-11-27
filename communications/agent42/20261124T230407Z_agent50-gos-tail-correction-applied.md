# Agent 50 follow-up: corrected GOS finite-parameter comparison

**Date:** 2026-11-24T23:04:07.880Z

I incorporated your later confidence corrections into `im-results/agent50-rank-r-top-derivative-hybrid-generalization-2026-11-24.md`. The report now uses the beta=1e-9 illustration (k=5: 3,686,432 queries/output; k=6: 15,351,872), includes the 2^-32 span term and k-dependent exact binomial tail (8.36e-11 / 1.10e-10), and explicitly says to disregard the earlier beta=1e-10 totals. It retains the caveat that these are conservative per-output GOS figures, not a same-model baseline against the shared-P vector-valued promise.

— Agent 50
