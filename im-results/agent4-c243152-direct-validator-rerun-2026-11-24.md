# Direct-validator rerun against the FramePosition candidate c243152

**Classification:** intermediate validator evidence only; not end-to-end transaction acceptance or release acceptance.

## Exact pins

- Candidate source commit: `c243152490394f9289e5516548d93005995711b6`.
- Candidate source file: `src/source-observation-plan.js`, blob `cf1df37afb65ff60e639a005827df58914325127`.
- Exact pinned harness: `im-results/source-observer-rebind-counterexamples-2026-11-24.js`, blob `01ab16a62a1e7bd586126c0637633e24fad9df64`.
- Execution branch: `agent4/rebind-harness-c243152-20261124`, created from the candidate commit. It adds the pinned harness, a report-only Node test wrapper, and an artifact-upload step; production source remains unchanged.
- Workflow run: [45445741559](https://github.com/FlareZ123/obfs/actions/runs/45445741559), Node v22.23.4, Ubuntu and Windows.

## Captured result

The nested exact harness process exited with status **1** on both platforms. Captured stdout:

```text
export-prefix: {"trackedRanges":4,"validatorAccepted":false}
```

Captured stderr reports the pinned harness assertion at line 56: `export-prefix: current rebind unexpectedly rejected this synthetic pass` (`false !== true`). This is expected relative to the harness's old-candidate expectation: the c243152 validator now rejects the export-prefix mutation. The workflow itself concluded success because the report-only wrapper preserves the nested process status rather than asserting that the old harness must pass.

The mutation inserts `export ` before the original callable declaration. The current validator rejects it because the callable no longer satisfies the top-level/private callable invariant. The four mapped ranges show that the candidate now tracks the callable, reader call, reader-result declaration, and exported mirror.

## Critical limitation

The pinned harness is fail-fast and stops at the first rejected mutation. Therefore this run does **not** execute the other six counterexamples on c243152. It establishes only that the export-prefix case is rejected on both platforms; do not infer that the remaining cases are fixed from this run.

The harness directly calls `advancePlanRanges` and `validatePlanSemantics`. It does not call `acceptPlannedPass`, does not exercise core transaction commit/rollback, does not run `obfuscateFiles` end-to-end, and does not execute the comprehensive acceptance suite. The strict project JSDoc, external JSDoc, and paired-budget JSDoc steps passed on both platforms, but those checks are not substitutes for behavioral transaction tests.

## Artifacts and reproduction

Run 45445741559 uploaded two artifacts: `source-observer-rebind-c243152-Linux` and `source-observer-rebind-c243152-Windows`. Each contains `direct-validator-run.json` with candidate/harness pins, nested exit status, stdout and stderr.

Reproduce from the execution branch with:

```sh
node im-results/source-observer-rebind-counterexamples-2026-11-24.js
```

Expected current-candidate behavior for this pinned fail-fast harness is exit 1 after the first line reports `validatorAccepted:false`; this is not a clean passing harness result.

**Decision:** one old rebind counterexample is rejected by c243152. The remaining counterexamples and end-to-end transaction behavior remain unresolved by this run. Keep release status blocked pending Agent 10's comprehensive acceptance.