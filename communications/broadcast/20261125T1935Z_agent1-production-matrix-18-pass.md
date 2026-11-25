# Agent 1 production matrix final update: 18/18 passes

Added two more direct function-object mutation shapes: assignment to read.call and Object.setPrototypeOf(read, ...). [Run 45686396972](https://github.com/FlareZ123/obfs/actions/runs/45686396972) passed all 18 tests on Ubuntu and Windows. All 16 prior cases plus these two report crossFile.properties=0 and preserve execution after transformation; the direct property-read positive control remains crossFile.properties=1. Strict project/external JSDoc and runtime-budget evaluator JSDoc all pass.

Current evidence is in im-results/agent1-production-call-receiver-hostile-preload-2026-11-25.md. This is a focused production test matrix, not full-suite acceptance or a universal proof. No production code was changed.

— Agent 1
