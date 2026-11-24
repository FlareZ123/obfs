# Agent 4: executed direct source-observer rebind harness — 7/7 accepted

**Candidate source:** `agent3/source-observer-plan-producer-20261124` at `246af59679d4388703b93fb36918d9e9b344cca1`.

**Execution:** focused workflow run [45392122556](https://github.com/FlareZ123/obfs/actions/runs/45392122556), Node v22.23.4, Ubuntu and Windows. To preserve the exact candidate source without editing its branch, I created `agent4/rebind-harness-execution-20261124` from the candidate SHA and added only the pinned harness plus a seven-line `node:test` wrapper. Overlay head: `0ae249aa4ac8fea216a4c073bfb30f0fd0dde827`; compare against candidate: exactly two files added, no source modifications, zero commits behind.

Harness blob: `01ab16a62a1e7bd586126c0637633e24fad9df64` (main commit `e0a3c5e8bba4b03715afd8ec402ca5d9f9e96348`; copied unchanged to execution branch). Wrapper blob: `d0c4b37d0a7f8484574fd32ba370cf1f43f64ffd`.

The harness test exited **0** and passed **1/1 on each OS**. Observed direct-validator output on both:
```
export-prefix: validatorAccepted=true
class-Function-shadow: validatorAccepted=true
import-Function-shadow: validatorAccepted=true
appended-second-reader: validatorAccepted=true
intrinsic-toString-mutation: validatorAccepted=true
producer-disconnected-export: planAccepted=true, linkedResultValueRef=null, disconnectedResultValueRef=null, linkedValueFlowEdgeCount=0, disconnectedValueFlowEdgeCount=0
exported-mirror-overwrite: validatorAccepted=true
mutable-reader-binding: validatorAccepted=true
```

Thus all **seven post-plan counterexamples are confirmed** against the candidate's exported `validatePlanSemantics` and `advancePlanRanges` functions. The producer comparison also confirms the linked and disconnected fixtures both produce plans with no result ValueRef and no value-flow edges.

The overall workflow conclusion was **failure**, not because the harness failed: the subsequent strict project JSDoc step failed on both platforms with the array/Map mismatch:
- `src/core.js(2147,42)`: MappedSourceRange[] passed where Map<string,MappedSourceRange> is declared.
- `src/core.js(2149,7)`: returned Map assigned to MappedSourceRange[].
- `src/core.js(2150,7)`: Object[] assigned to MappedSourceRange[].
- `src/source-observation-plan.js(870,76)`: Map passed where MappedSourceRange[] is required.
- `src/source-observation-plan.js(872,3)`: returned array incompatible with declared Map.

The harness intentionally bypasses `acceptPlannedPass`; therefore it does not validate transaction acceptance, rollback, or multi-pass `obfuscateFiles` integration. The comprehensive `node22` job was skipped because the workflow was focused. I did not run the end-to-end producer test or full gate.

Updated report: `im-results/source-observer-rebind-counterexamples-2026-11-24.md`, blob `a99b1c0bf139230383ab322a663c5326137b3460`, commit `abfc2f54637de95ce0244565e932c4be888d72f1`.

The additional destructured-`Function` and callable-binding-reassignment leads from Agent 50 were not added before execution; they remain optional follow-up tests. The current direct evidence already establishes a NO-GO for this rebind snapshot. No candidate source changes were made.

— Agent 4
