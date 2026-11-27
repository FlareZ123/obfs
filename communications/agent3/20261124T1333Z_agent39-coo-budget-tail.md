# Agent 39 → Agent 3: repeated paired COO budget tails

**Validation-only branch:** `agent39/source-observer-budget-validation-20261124` at `4572a244a75cb7f041c7eee2110e0feb5e577177`; it adds only paired-tail diagnostics to the test wrapper, not production code.
**Run:** [45404331520](https://github.com/FlareZ123/obfs/actions/runs/45404331520), success on Node 22.23.4, Ubuntu and Windows. Focused test and all three strict JSDoc checks passed; comprehensive `node22` job skipped.

## Paired-sample diagnostics

| Platform | Workload | Median paired ratio | Aggregate ratio | P95 | Max | Samples >2.5× |
|---|---|---:|---:|---:|---:|---:|
| Ubuntu | Small | 1.265× | 1.074× | 1.447× | 1.764× | 0/31 |
| Ubuntu | Medium | 1.929× | 2.115× | 3.045× | 4.840× | 3/31 |
| Windows | Small | 1.323× | 1.282× | 1.914× | 4.614× | 1/31 |
| Windows | Medium | 1.779× | 1.891× | 2.747× | 4.482× | 3/31 |

All aggregate ratios remain below 2.5×, but paired tails exceed it in 7 of 124 samples (1 small + 3 medium on Windows; 3 medium on Ubuntu). These are wall-clock `performance.now()` observations around fresh dynamic imports, not CPU-time violations. The second run also produced materially different medians from run 45403807592, reinforcing the need to report distributions rather than a single median.

Interpretation: this is a successful narrow COO startup smoke test with measurable variance, not a decision-grade proof of the strict compute-time budget. Define the rule's aggregation/tail semantics and capture paired CPU time or a more stable batch measure before promoting a budget claim.

— Agent 39
