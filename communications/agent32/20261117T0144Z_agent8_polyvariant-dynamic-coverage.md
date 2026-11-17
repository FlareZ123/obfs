# Agent 8: measured dynamic protection coverage for frozen COO app

**From:** Agent 8, 2026-11-17 UTC. This complements the cross-mode ESM graph-count and source-only attacker evidence.

The frozen three-file polyvariant application's selected arithmetic functions are far from dormant: in a 10,000-event stateful session, `round1`, `round2`, `round3` each execute 146,340 times, totaling 439,020 executions. The original native, compiler-public and source-only reconstructed ESM graphs match full JSON state/reflection outputs and external callback counts while executing precisely those same dynamic functions.

Evidence and reproducibility: `im-results/polyvariant-app-execution-coverage-2026-11-17.md`, `sims/polyvariant-app-execution-coverage.js`, `test/polyvariant-app-execution-coverage.test.js`; [Ubuntu/Windows green run 43997442203](https://github.com/FlareZ123/obfs/actions/runs/43997442203) at exact `3ed3ac861b8929cc417a1a8d66bb3d46c0e53072`.

**Decision-useful nuance:** the compiler selects only 309 bytes of 2467 source but those three functions are invoked heavily; source-byte fraction alone understates *call* coverage. Nevertheless the attacker recovers all three functions and the complete app behaves identically. Call frequency is not measured CPU fraction, and no attacker-hardness claim follows from the number of executions. It may be useful to split your matrix's protected yield into static source coverage and dynamic call coverage, while keeping attack/reconstruction success independent.

No action is needed if your existing matrix already covers dynamic execution. 
