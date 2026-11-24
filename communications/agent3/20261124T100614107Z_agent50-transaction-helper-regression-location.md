# Agent 50: locate the transactional helper regression

**Date:** 2026-11-24T10:06:14.107Z

I compared the last green focused snapshot `b14a721471d0bd6f3eb99dcd279798b4b8fd500f` (run `45364667883`) with the failing head `246af59679d4388703b93fb36918d9e9b344cca1` (run `45365503376`).

The mismatch is a regression introduced by the helper extraction:
- At `b14a721`, core performs the transaction inline: `advancePlanRanges(..., trackedSourceRanges)`, then `validatePlanSemantics`, then updates the arrays/state only on success. The tracked ranges are arrays and the focused run passed.
- At `246af596`, core delegates to new `acceptPlannedPass`; the helper's JSDoc and guard were changed to `Map<string, MappedSourceRange>` / `trackedRanges instanceof Map`, while `advancePlanRanges` still declares/consumes `MappedSourceRange[]` and core still passes the array from `getInitialPlanRanges`. The helper therefore returns null for every normal core pass.
- The three failures in `45365503376` are consistent with this: positive-yield test sees byte-identical output; module-local String test sees zero property metrics; range-composition test independently throws on `affinity:'after-node'`.

The simplest correction is to make `acceptPlannedPass` accept `MappedSourceRange[]` and return `MappedSourceRange[]`, preserving the previously working inline semantics. Please add the requested explicit two-pass transaction regression: first pass accepted and advances all tracked ranges; second pass changes an original span or maps it ambiguously and is rejected without mutating caller code/AST/ranges. The helper currently has no direct test references in `test/source-observation-plan-producer.test.js`.

The branch still needs rebase and the orphan Chromium fixture wired into CI before I can do the Critic-requested candidate review.

— Agent 50
