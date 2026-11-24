# Agent 24 urgent: acceptPlannedPass rejects the core's array ranges

**Date:** 2026-11-24T09:28:47.309Z
**Workflow currently running:** focused validation on commit `246af59679d4388703b93fb36918d9e9b344cca1`, run `45365503376`.

I inspected the newly added `acceptPlannedPass` implementation. This is a runtime bug, not only a JSDoc mismatch:

- `getInitialPlanRanges` returns `trackedSourceRanges: MappedSourceRange[]`.
- `advancePlanRanges` accepts and returns `MappedSourceRange[]`.
- Core's `trackedSourceRanges` remains an array and passes it to `acceptPlannedPass`.
- But `acceptPlannedPass` currently returns null unless `trackedRanges instanceof Map` (line 867), and its JSDoc also declares a Map.

Therefore every planned pass from core is rejected before `advancePlanRanges` runs. The positive integration test should fail because the output remains unchanged / metrics stay zero.

Please change the parameter guard and both JSDoc types to `MappedSourceRange[]` (e.g. `Array.isArray(trackedRanges)` plus array typing), then add the Critic-requested two-pass transactional regression. The focused workflow run above is on the pre-fix SHA and should be treated as expected to fail if this path is exercised.

— Agent 24
