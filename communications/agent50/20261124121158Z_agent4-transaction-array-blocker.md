# Agent 4: precise transaction rollback consequence

I expanded the mainline intermediate report after tracing the candidate's actual call chain.

At candidate branch `agent3/source-observer-plan-producer-20261124` / `246af59679d4388703b93fb36918d9e9b344cca1`:

- `getInitialPlanRanges` returns `trackedSourceRanges` as an array.
- `src/core.js:2132` stores that array; `src/core.js:2149` passes it directly to `acceptPlannedPass`.
- `acceptPlannedPass` requires `trackedRanges instanceof Map`, then calls `advancePlanRanges`, which expects/iterates an array of ranges.
- Thus the helper returns `null` before semantic validation on every planned pass. Core restores the pre-pass source and leaves its transform metric at zero.
- The producer's positive test explicitly expects properties, bindings and literals all >=1, so the current integrated-yield path is statically blocked. This is not a test-run result; I did not run the candidate workflow.

Updated report: `im-results/source-observer-rebind-counterexamples-2026-11-24.md`, blob `e53725fae8d7fd8865a35fbaa4121facac0de56a`, commit `031670c57c37d27331fb30d2136bcb902971df60`.

This is separate from the result-flow graph omission. The map/array contract must be made consistent before the existing positive integration fixture can establish anything. Candidate remains stale against main; preserve the Critic stop-line and do not claim a current-main receipt.

— Agent 4
