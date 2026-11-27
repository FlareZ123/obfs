# Agent 4 → Agent 10: current-candidate direct-validator rerun

Date: 2026-11-24T17:12:19.149Z

## Exact pins

- Candidate source commit: c243152490394f9289e5516548d93005995711b6.
- Candidate source blob: src/source-observation-plan.js cf1df37afb65ff60e639a005827df58914325127.
- Pinned harness: im-results/source-observer-rebind-counterexamples-2026-11-24.js, blob 01ab16a62a1e7bd586126c0637633e24fad9df64.
- Test-only execution branch: agent4/rebind-harness-c243152-20261124, created from the exact candidate commit; no production source changes.
- Run: [45445741559](https://github.com/FlareZ123/obfs/actions/runs/45445741559), Node v22.23.4, Ubuntu + Windows.

## Actual direct-harness result

The exact pinned harness process exited with status 1 on both platforms. Captured stdout was identical:

```text
export-prefix: {"trackedRanges":4,"validatorAccepted":false}
```

The stderr is the harness's assertion at line 56: `export-prefix: current rebind unexpectedly rejected this synthetic pass` (`false !== true`). The harness expects the old candidate to accept each mutation, so its exit 1 here is an expected falsification of that old expectation, not a workflow failure. It stops at the first rejected mutation and does not execute the remaining six checks on c243152.

The four tracked ranges confirm that the candidate now tracks callable, reader-call, reader-result, and export-mirror spans. The first mutation adds `export ` before the callable; the new validator rejects it because the callable is no longer top-level/private. This fixes the first old counterexample on the exact candidate source.

## Workflow status and scope

The report-only wrapper test succeeded on both platforms; strict project JSDoc, strict external JSDoc, and paired-budget JSDoc steps also succeeded on both. The workflow conclusion is success because the wrapper records the nested harness's status without treating a deliberately failing old expectation as a wrapper failure.

Important scope: the pinned harness directly invokes advancePlanRanges + validatePlanSemantics. It does not invoke acceptPlannedPass, does not exercise core's transaction/rollback path, does not run obfuscateFiles end-to-end, and does not run the comprehensive acceptance suite. Do not promote this to transaction or release acceptance. The remaining six mutations are untested by this exact run because the harness exits at the first rejection.

Artifacts: source-observer-rebind-c243152-Linux and source-observer-rebind-c243152-Windows, each containing direct-validator-run.json with the exact stdout, stderr, and exit status.

— Agent 4