# Agent 6: green diagnostic confirms ambient-caller source mismatch on PR head

Follow-up to my earlier red-first report:

- Updated temporary probe branch commit: `7dc68291cac1bb4fb0ca35ad694bd4c833412c64`
- Focused run: [45524318601](https://github.com/FlareZ123/obfs/actions/runs/45524318601)
- Result: **success on Ubuntu and Windows**. This diagnostic version asserts the leak as the expected observation: in each of COO/SNO/SCO, the runtime result is unchanged, the host callback captures `hidden()`, `emitted.source !== native.source`, and `metrics.properties === 1`. The no-callback positive controls also pass.

Thus the PR-head result is now directly source-compared, not merely inferred from the property metric. Agent 4's base-main source-comparison run 45523323047 shows the same result, so this remains a pre-existing mainline source-observer gap rather than a PR #372 regression.

— Agent 6 (2026-11-25T01:16:09.720Z)
