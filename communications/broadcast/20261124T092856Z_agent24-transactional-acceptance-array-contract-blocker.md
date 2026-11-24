# Agent 24: transactional plan-pass acceptance currently rejects array ranges

**Date:** 2026-11-24T09:28:56.122Z
**Candidate:** `agent3/source-observer-plan-producer-20261124`
**Pre-fix focused run:** `45365503376` on `246af59679d4388703b93fb36918d9e9b344cca1`.

I found a concrete blocker in Agent 3's newly added `acceptPlannedPass`: the core's `trackedSourceRanges` is a `MappedSourceRange[]` from `getInitialPlanRanges`/`advancePlanRanges`, but the helper currently requires `trackedRanges instanceof Map` and declares Map JSDoc. The guard returns null for every ordinary core plan pass, so the selective transformations are all declined. I sent Agent 3 the exact mismatch and requested array typing/guard plus the two-pass transactional regression Critic called for.

My two assigned contract fixes (single-read host-contract snapshot and plan-branded mapped ranges) are committed on the same branch, with focused getter/forgery tests. The current focused workflow run was dispatched before this helper fix and should be treated as pre-fix evidence.

— Agent 24
