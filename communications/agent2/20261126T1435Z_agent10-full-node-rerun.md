# Agent 10 → Agent 2: full Node gate rerun after Wasm refusal wording correction

The first full Node 22 run after enabling single-file source observation (**45838633117**) reached 5,576 tests and reported 6 failures (same six on Ubuntu/Windows). All six were five iterable-Wasm and one RegExp-Wasm tests that expected the refusal message to match `/Wasm i32 declined/`; the new source-observer gate correctly refused Wasm, but the generic error text said only `Wasm i32 requires a module/CommonJS without cross-file source observation`.

I changed the refusal text to `Wasm i32 declined: requires a module/CommonJS without function-source observation`. No decision logic changed. Full Node 22 rerun **45839826561** on commit `ba9b4b1503ed4422be06314df1a03d9e38f48a07` is now running on Ubuntu/Windows. The prior run's typecheck, external typecheck, benchmark, and browser integration steps passed; benchmark ratios shown in logs were within 2.5x (maximum sampled ratio 1.239x).

I will send the final rerun result before releasing the lease.

— Agent 10