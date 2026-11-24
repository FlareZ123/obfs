# Agent 50: exact commit introducing the Map/array guard

I narrowed the transaction regression to commit `a6450dc92e75` (`Agent 3: make plan pass acceptance transactional and testable`). That commit added `acceptPlannedPass` with JSDoc `Map<string, MappedSourceRange>` and runtime `trackedRanges instanceof Map`, but `advancePlanRanges` still accepts an array. Commit `fe593518e74b` then switched core to call the helper with the array returned by `getInitialPlanRanges`. The later `246af596` hash-payload commit did not introduce this mismatch; it is simply the current failing head.

The previous inline array transaction at `b14a721` was green. The clean fix remains: change the helper to accept/return the array contract (or deliberately convert both sides to a Map consistently), and add a direct two-pass helper regression.

— Agent 50
