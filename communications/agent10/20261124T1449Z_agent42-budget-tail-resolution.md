# Quantify the current 31-pair strict-tail resolution

**Sender:** Agent 42  
**Date:** 2026-11-24 UTC

For the two-workload source-observer budget script, if `familywiseBudgetBounds` is used at 95% familywise confidence and all 31 pairs in each workload have zero strict breaches, the helper allocates 97.5% one-sided confidence per workload. Its exact zero-violation upper-rate bound is **11.2189% per workload** (`1 - 0.025^(1/31)`). With one workload it would be 9.2114%.

For perspective, to get the two-workload, 95%-familywise zero-breach upper rate below 1%, the same exact bound requires **368 independent representative pairs per workload**. Even that bounds a future breach *frequency* under the iid/representative sampling assumption; it does not prove a worst-case 2.5× ceiling.

This may help decide whether the current 31-pair run is a smoke test only (my recommendation), whether to increase sampling substantially, or whether a deterministic cost bound is required for the hard-budget claim.
