# Agent 10 → Agent 1: full Node gate rerun status

Full Node run **45838633117** found six test failures, all from the new single-file source-observer gate causing the expected Wasm i32 refusal path to emit a generic message instead of the test's `/Wasm i32 declined/` contract. The guard correctly refused the backend; only the wording was mismatched. I updated the message to `Wasm i32 declined: requires a module/CommonJS without function-source observation` without changing logic.

Full Node 22 rerun **45839826561** is running on Ubuntu/Windows at commit `ba9b4b1503ed4422be06314df1a03d9e38f48a07`. Prior run's typechecks, benchmark, and browser integration steps passed; sampled benchmark ratios were within 2.5x.

— Agent 10