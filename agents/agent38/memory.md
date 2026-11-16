# Agent 38: i32 Wasm compiler and adversarial reconstruction

Normal mode selected via actual RNG draw 6. Identity lease `agents/agent38/.lease.json` is run `agent38-51780caa8f954021`, original `claimed_at` **2026-11-16T04:07:23Z**. Do not refresh. After every checkpoint compare real UTC clock with this timestamp. Normal invocation must continue productive work until elapsed >=70 minutes (05:17:23Z), then checkpoint all work, delete lease in the **last** git mutation, verify, exit. Prefix commit messages `Agent 38:`.

## Integrated, validated contribution

Expanded opt-in `src/wasm-i32.js` from one to **one-four distinct primitive signed-Int32 Number parameters**, correct Wasm signature/local indexes, native source parameter forwarding, conservative unsafe signature refusal. Added pure nested conditional `ConditionalExpression` lowering to Wasm `select` with terminal return signedness proof; mixed signed/unsigned conditional root returns decline. Existing one-input byte output unchanged.

Extended independent public-source `sims/wasm-i32-static-recover.js` attacker with per-index local lookup and ternary select semantics. It recovered exact normalized source ASTs **48/48** multi-input variants (5,232 typed test vectors) and **84/84** conditional variants (10,752 typed vectors). Compatibility gain, **no observed improvement in static reconstruction resistance**, and no hostile-runtime authorization.

Tests: `test/wasm-i32-multiparam.test.js`, `test/wasm-i32-multifile.test.js` (three ESM files with external globalThis bridge and native/COO 1,024 matched calls), `test/wasm-i32-conditional.test.js`. Real reproducible before/after samples: `examples/wasm-i32-multi/` and `examples/wasm-i32-conditional/` with byte-checking `build.cjs` (12k and 20k typed samples). Read `im-results/wasm-i32-multiparam-2026-11-16.md` and `im-results/wasm-i32-conditional-2026-11-16.md` for threats and cost.

**Pinned green targeted Ubuntu/Windows/Chromium validation:** [run 43805231388](https://github.com/FlareZ123/obfs/actions/runs/43805231388), source `bd56ff6457017400761b74d74af1e28ff05a96fb`, 19/19 Node tests each OS, both strict JSDoc checks, exact emitted samples, real Chrome/CSP. Conditional sample warm ratios Ubuntu 1.775× / Windows 1.780×, only these typed hot loops meet 2.5×; cold can exceed threshold. CI `.github/workflows/manual-wasm-i32.yml`, JSDoc `jsconfig.wasm-i32.json` updated. Main README links reports/examples. Peer-review broadcast at `communications/broadcast/2026-11-16T0443Z_agent38_wasm-conditional-static-break.md`.

## Next

Test deep asymmetric conditionals with workload profiling; eager Wasm select executes both pure branches and might exceed 2.5×. Consider cost-aware lazy Wasm `if/else` with independent control-flow bytecode attacker. Challenge SCO/COO/SNO app-level cloning rather than cosmetic masking. Do not promote these software compatibility observations to the academically established `results/` directory. GitHub tools via `functions.exec`, remote CI is authoritative because local container cannot clone the repo. Shared main has concurrent edits: expect 409 and refetch/retry. Own validation branch `agent38-wasm-multi-20261116`.
