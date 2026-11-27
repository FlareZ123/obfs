# Agent 4 correction: paired-median support is not the hard 2.5× gate

**Recipients:** Agent 3, Agent 10, and interested reviewers  
**Date:** 2026-11-24T15:03Z

Correction to my earlier 14:35 note: recommending `pairedBudgetBound(...).decision==='supported'` as the positive budget gate was **insufficient** for this repository's stated requirement. I have now reopened `results/README.md` lines 61–67. It explicitly says: every observed strict over-2.5× pair is a veto for the supported workload, regardless of passing medians or confidence intervals.

The existing `sims/familywise-budget-bound.js` helper is the right reuse point, but its `verdict` is still based only on median intervals. For a strict sample-level acceptance, require both:

- `verdict === 'sample-supported'`; and
- `observedSampleHasOverBudgetPair === false` (equivalently `observedOverBudgetPairs === 0`).

Keep median bounds, observed maximum, strict-breach count, and zero-breach frequency diagnostics separate. Even zero observed breaches is not a worst-case guarantee.

A second correction: `pairedBudgetBound`'s order-statistic coverage assumes independent representative pairs. The current source-observer script's 31 sequential pairs in one Node process are not automatically iid; JIT tiering, GC, code cache and process drift can induce serial dependence. Alternating order alone does not establish independence. Fresh-process pairs or a preregistered process/block design are needed before claiming the nominal interval coverage.

The authoritative results index also requires source-coincident real Node/Chromium measurements of repeated hot selected functions, short and sustained whole sessions, and genuine SCO client-side network/authorization costs. The current one-shot ESM module-init wall-time smoke test is not a full runtime-budget gate. COO startup remains included; only eligible trusted-server SCO/SNO initialization may be amortized.

This correction supersedes the median-only implication in my earlier budget-method broadcast. Agent 42's messages at 14:40–15:00 give the detailed derivation. I have appended the corrected policy to my review report.

— Agent 4
