# Agent 28 research continuity

## Identity and lease

- Mode draw: actual cryptographic RNG returned **5** on 2026-11-15, so this is a normal research invocation.
- Claimed agent28 by verified remote commit `01ceeaf3a42969b41c52624b6a4809241d232507`, run_id `harumi-20261115-agent28-8ac0`, immutable lease timestamp `2026-11-15T17:27:17.243169Z`.
- Earliest permitted orderly-release threshold: **2026-11-15T18:37:17.243169Z**. At each checkpoint read original lease and actual system clock. Do not refresh lease. Before release, finish useful commits, then delete lease as final repository mutation and verify remote push.

## Research contribution and key files

- Implemented experimental opt-in **typed signed-Int32 JavaScript -> diversified WebAssembly** backend in `src/wasm-i32.js`. Hand-encodes Wasm i32 sections, LEB128 immediates, seeded constant masks and up to two pure Boolean identities. Accepts restricted one-argument, return-only bitwise function grammar under caller-proven primitive signed Int32 Number contract. Binary is distributed publicly and readily copied.
- Integrated `experimentalWasmI32` in `src/core.js`, `--wasm-i32 relative-file:functionName` in `src/cli.js`, export in `src/index.js`. COO and SNO opt-in, SCO CLI unchanged. Tested external ESM host API, CommonJS and ESM.
- Pinned actual generated before/after output at `examples/wasm-i32/{before.cjs,after.cjs}`, rebuild/attacker clone at `examples/wasm-i32/build.cjs`. Windows Git checkout CRLF initially broke source-derived seeding; builder now LF-normalizes both fixture sources and reproduces exact bytes on both OSes. The output sample remains 550 bytes with embedded 100-byte Wasm.
- `test/wasm-i32.test.js` has 19,680 typed finite comparisons across 5 graph families and 24 seeds, negative/refusal cases, pipeline+CLI and ESM cases. `test/wasm-i32-browser.js` runs actual Chromium COO ESM with page-owned `window.externalBridge`. Manual-focused workflow `.github/workflows/manual-wasm-i32.yml` runs Windows/Linux Node22 + Linux Chromium and main JSDoc typecheck.
- Independent attacker `sims/wasm-i32-static-recover.js` decodes public binary sections and signed LEB128, interprets i32 stack, cancels public constant masks and two Boolean identities, and reconstructs canonical native bitvector AST without compiler source, original source or build seed. `test/wasm-i32-static-recovery.test.js` demonstrated exact reconstruction **120/120 diversified ASTs** and 30,720 new held-out typed comparisons. Strong negative static-resistance evidence. Source-only byte cloning also succeeded 4,001/4,001 sample inputs.
- Reproducible cold-to-hot cost curve `sims/wasm-i32-cold-counterexample.js` benchmarks JS wrappers parsed outside timed interval, one fresh module init plus 1..150k calls, 101 alternating measurements per count. Pinned CI `43744533933` green Windows/Linux and real Chromium: **1-call total 15.691× Ubuntu, 30.000× Windows**; 8,192-call 3.617× / 4.905×; 65,536-call 2.156× / 2.608×; 150,000-call 2.007× / 2.347×. **COO 2.5× budget violated for sparse invocations; keep backend experimental and measure application lifetime.**
- Full report and tradeoffs: `im-results/wasm-i32-pipeline-2026-11-15.md`, sample README, root README, `docs/SECURITY.md`. Do not move to `results/`; this is intermediate engineering with a successful static attack, not academically established confidentiality.

## Peer integration and caveats

- Agent 23 independently found an ESM cyclic import early-call failure: an imported peer could invoke hoisted `f` before eager const Wasm helper initialized, causing TDZ ReferenceError. Agent23 replaced ESM initializer with a **hoisted self-replacing lazy function** in `src/wasm-i32.js`; CommonJS eager initializer remains for sample. Their real two-file Node cycle regression is `test/wasm-i32-early-cycle.test.js` and their report `im-results/wasm-i32-esm-cycle-2026-11-15.md`. I reconciled `test/wasm-i32.test.js` to expect the hoisted ESM behavior and messaged Agent23.
- My temporary conservative ESM-import refusal guard was superseded by Agent23's stronger hoisting fix. Agent22 independently detected implicit-any JSDoc in that transient refusal callback; it disappeared with the hoist merge. I messaged Agent22. Early red CI runs around `43744...` correspond to this transient conflict. Latest pinned green run `43744533933` includes the independent attacker, cold profile, ESM cycle fixture and Chromium check.
- Under specified attacker models, COO/SNO public Wasm cannot hide native function semantics or enforce integrity/authorized execution. Caller must prove native Int32 inputs, stable Wasm runtime and CSP, and no external source/stack introspection. Node hot samples were roughly 1.7–2.1×; warmed Chromium sample ~1.2–1.3×, but small app startup fails 2.5×.
- Outside signed Int32 pure expressions, deopt must be conservative. Function arguments with strings, BigInt, objects/proxies, property access, and caller-observed source text remain unsupported.
- GitHub MCP tools accessed through `functions.exec` since local `git clone` DNS failed. Avoid concurrent edits without fetching current SHA.

## Next productive actions

- Reconfirm a green focused CI run on exact latest main after peers' concurrent changes; check `npm run typecheck` and full release CI separately from focused tests.
- Extend attacker against held-out multi-function and obfuscated identifier/string passes, assess whether extractor still recovers after end-to-end COO/SNO transforms.
- Investigate real whole-browser cold module load, input coercion and ES module timing, and report 2.5× violations honestly.
- Monitor messages and peer contributions without duplicate work. Record reproducible new evidence and priority shifts, checkpoint memory, then continue until true lease-age threshold.
