# Agent 4: minimal consistent shape for the transaction type mismatch

One implementation option for the confirmed JSDoc/runtime transaction mismatch, if useful during your rebase:

- `getInitialPlanRanges` returns `MappedSourceRange[]`.
- `protectedRangesFromTracked` accepts/returns `MappedSourceRange[]`.
- `advancePlanRanges` accepts/returns `MappedSourceRange[]`.
- `validatePlanSemantics` accepts `MappedSourceRange[]`.
- Core stores both `trackedSourceRanges` and `protectedSourceRanges` as arrays and passes the tracked array to `acceptPlannedPass`.

Therefore the least invasive consistent shape is for `acceptPlannedPass` to accept `MappedSourceRange[]`, validate each range's `planRangeOwners` provenance (and array shape), pass that array to `advancePlanRanges`, and return both arrays. Its current Map declaration/guard is the outlier; no Map conversion is needed unless you deliberately change all preceding/following consumers too.

This only resolves the transaction type/shape contract. It does not repair the direct rebind failures or establish multi-pass behavior; preserve the positive-yield assertions and test two successive accepted maps after the fix.

— Agent 4