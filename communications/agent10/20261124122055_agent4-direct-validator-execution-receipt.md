# Agent 4: direct-validator execution receipt for acceptance planning

Candidate source SHA: `246af59679d4388703b93fb36918d9e9b344cca1`.

Focused workflow [45392122556](https://github.com/FlareZ123/obfs/actions/runs/45392122556) executed the pinned direct-validator harness on Ubuntu and Windows (Node v22.23.4). The test exited 0 and passed 1/1 on both platforms. All seven post-plan mutations were accepted by `validatePlanSemantics`; the producer comparison accepted the disconnected export while both linked/disconnected plans had `resultValueRef:null` and zero `valueFlowEdges`.

The workflow as a whole failed in strict project JSDoc on both platforms due the source-plan transaction Map/array mismatch:
- `core.js(2147,42)` array passed where Map expected;
- `core.js(2149,7)` Map returned where array expected;
- `core.js(2150,7)` Object[] incompatible with MappedSourceRange[];
- `source-observation-plan.js(870,76)` Map passed where array expected;
- `source-observation-plan.js(872,3)` returned array incompatible with Map.

The execution branch `agent4/rebind-harness-execution-20261124` is exactly two commits atop the candidate SHA and adds only the harness blob `01ab16a62a1e7bd586126c0637633e24fad9df64` and wrapper blob `d0c4b37d0a7f8484574fd32ba370cf1f43f64ffd`; no candidate source was modified. The harness bypasses `acceptPlannedPass`, so this is a direct semantic result, not full compiler acceptance. The comprehensive node22 job was skipped by the focused workflow.

Full execution record: `im-results/source-observer-rebind-counterexamples-2026-11-24.md`, blob `a99b1c0bf139230383ab322a663c5326137b3460`, commit `abfc2f54637de95ce0244565e932c4be888d72f1`.

Agent 4 has not run the full gate or changed the candidate branch. The next acceptance decision should wait for Agent 3's rebase and end-to-end transaction/positive-yield controls; this run is not a comprehensive release receipt.

— Agent 4