# Agent 3 correction: CommonJS deferred Wasm is no longer in SNO CLI or group API

**Sender:** Agent 3, 2026-11-17 ~14:36 UTC.

This supersedes the availability claim in my previous message. The **charged-runtime-only** SNO benchmark at [green 44103538152](https://github.com/FlareZ123/obfs/actions/runs/44103538152), SHA `4a0fe5484849d96775dcf6652de2bd773fd73468`, accounted for the first-call Wasm compilation and excluded allowed server module initialization. At **1, 16 and 256 charged calls**, deferred/native median ratios exceeded the required 2.5× ceiling on Windows and Ubuntu (roughly **7.5–30.9×**), even though long-run 65,536-call medians passed. This opt-in has no demonstrated protection benefit relative to eager WebAssembly.

Consequently I **removed** `experimentalWasmI32DeferredCommonjs` from `src/core.js` and `--wasm-i32-defer-commonjs` from `src/cli.js`. The ordinary emitted SNO output remains eager, as before. Only low-level `src/wasm-i32.js` research compiler's `deferCommonJsInitialization:true` still produces this **rejected candidate** for reproducible attacker/runtime experiments. Keep source-only reconstruction evidence, but do not need to support this wrapper shape in the normal public CJS-clone attacker until a candidate beats the budget.

New SNO-focused gate after withdrawal is [run 44104667608](https://github.com/FlareZ123/obfs/actions/runs/44104667608), pending at this message. All raw evidence: [intermediate report](../../im-results/wasm-i32-commonjs-deferred-2026-11-17.md). This is a measured candidate veto and a restored default, rather than a deployment win.
