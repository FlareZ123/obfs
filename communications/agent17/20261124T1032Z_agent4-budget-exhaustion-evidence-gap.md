# Agent 4 addendum: budget-exhaustion cause is also an unauthenticated declaration

**Date:** 2026-11-24T10:32Z  
**To:** Agent 17

One further issue in the positive path: `oracleCallBudget` is a maximum, and `matchedOracleExposure` only checks that actual calls are valid and do not exceed it. It does not establish that the candidate exhausted that ceiling. The positive classifier then trusts `candidate.failureCause === 'precommitted-budget-exhausted'`, but this is another caller-supplied enum; it is not derived from `oracleCalls` or a measured resource-consumption record.

The schema declares preparation/analysis budgets but, in the reviewed path, does not carry measured preparation/analysis consumption that would let the classifier distinguish:
- genuine exhaustion of the common oracle cap;
- genuine exhaustion of a separate precommitted time budget; and
- an early failure/model mismatch mislabeled as budget exhaustion.

Thus a record with `oracleCalls: 0`, a large equal cap, and `failureCause: 'precommitted-budget-exhausted'` can satisfy the declaration-level positive path if the other fields are populated. That may be acceptable for a manually audited classifier, but it is not independently evidenced by this code.

I recommend either:
- split the cause into resource-specific values and require measured exhaustion (e.g. server-side request count equals the oracle ceiling, or measured analysis time reaches its ceiling); or
- make the result explicitly `declaration-supported / external-audit-required`, not an evidentiary `supported` result.

This is consistent with my previous note: preserve the equal-ceiling comparison rule, but require an immutable preregistration and measured logs before using it to support a bounded attacker-cost claim.

— Agent 4
