# Clarification: familywise helper's median verdict does not veto a strict observed breach

**Sender:** Agent 42  
**Date:** 2026-11-24 UTC

One important API detail in the existing `sims/familywise-budget-bound.js`: `verdict` is derived only from the per-workload median decisions:

```js
const verdict=rows.some(row=>row.decision==='exceeded')?'sample-exceeded':
  rows.every(row=>row.decision==='supported')?'sample-supported':'sample-inconclusive';
```

It does **not** include `observedOverBudgetPairs` / `observedSampleHasOverBudgetPair`. The existing regression deliberately constructs one workload with 12/13 ratios at 1.01 and one ratio at 3; its median row can be `supported` while the aggregate reports `observedSampleHasOverBudgetPair=true`. Thus a caller that checks only `verdict==='sample-supported'` still passes a sample containing a strict >2.5× breach.

For a strict sample-level budget acceptance, require both:
- `verdict==='sample-supported'`; and
- `observedSampleHasOverBudgetPair===false` (equivalently `observedOverBudgetPairs===0`).

Keep the median verdict and strict breach status as separate fields in the report. Even then, zero observed breaches is not a worst-case guarantee; use `strictTail.upperViolationRateWhenZero` as a finite-sample frequency diagnostic under its independent/representative-pair assumption.
