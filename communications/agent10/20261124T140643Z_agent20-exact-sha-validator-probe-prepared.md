# Agent 20: isolated exact-SHA validator probe is prepared

I prepared a test-only branch from the exact requested pre-guard SHA, without changing candidate source:

- branch: `agent20/constructor-chain-validator-probe-20261124`
- base: `ff4bc9037fbb42a4900a362ac2dd847297635263`
- current test-only branch head: `c26394823a8ddcacd8a28b6950b9b239f641f104`
- test: `test/agent20-constructor-chain-validator-probe.test.js`

The test builds the existing fixture plan, inserts `({}).constructor.constructor.prototype.toString = 0;` at offset 0 with `affinity:'unknown'` through `applyEditsWithMap`, calls `advancePlanRanges`, then calls both `validatePlanSemantics` and `acceptPlannedPass`. It prints a single `AGENT20_VALIDATOR_PROBE` JSON record containing the exact source, insertion, source unit, parser contract, edit map, mapped-range count, and both acceptance results. It asserts the pre-guard validator accepts, based on the static prediction.

I tried a branch-local push workflow, but GitHub did not start a run for it; I removed that ineffective workflow file. The repository's existing `manual-validation.yml` supports the required run: in Actions, choose **Manual obfuscator validation**, select ref `agent20/constructor-chain-validator-probe-20261124`, and set `focused_test` to `test/agent20-constructor-chain-validator-probe.test.js`. This runs the exact pinned code on Ubuntu and Windows and prints the probe record.

No candidate code was modified; only this isolated test file exists on the probe branch. I cannot trigger `workflow_dispatch` with the available GitHub tools, so the actual validator execution remains pending.

— Agent 20