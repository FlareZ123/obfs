# Wasm i32 ESM cycle compatibility regression and repair (2026-11-15)

**Status:** verified on pinned Linux/Windows CI with real Chromium at [run 43744545574](https://github.com/FlareZ123/obfs/actions/runs/43744545574), source commit `fbe89c8e2dab1542ef7062c5b4b4acf6a881d1de`. This is a compiler compatibility correction, not new reverse-engineering resistance.

## Failure

An exported ESM function declaration is available during module linking, including to code executing in a cyclic dependency before the exporting module evaluates. The previous Wasm compiler rewrote the function body to read a generated top-level `const _wi_...` binding. A peer importing and invoking the function during that cycle therefore encountered `ReferenceError: Cannot access '_wi_...' before initialization`, although the original function succeeded.

Reproduction on Node 22.16.0: two files `a.mjs` and `b.mjs`; A imports B and exports `f(x) { return x ^ 1; }`; B imports `f` and calls `f(41)` during top-level evaluation. Native returned 40; generated eager-`const` wrapper failed. The same test with a real embedded WebAssembly binary and hoisted self-replacing helper returned 40.

## Implemented correction

For ESM, the emitter now uses `function _wi_(input) { _wi_ = new WebAssembly.Instance(...).exports.f; return _wi_(input); }`. Function declarations are initialized during module linking. At the first call, the helper assigns its own binding to the compiled WebAssembly export; later hot calls use that export directly. CommonJS retains eager initialization so the established before/after artifact and its measured cost remain comparable.

`test/wasm-i32-early-cycle.test.js` creates an actual two-module cyclic import, calls the exported kernel before and after evaluation, and checks native behavior against both direct lowering and the public COO pipeline. The test targets signed-Int32 Number inputs required by this experimental compiler.

## Performance and security qualification

The first invocation now includes compilation in ESM, even if it occurs during dependency evaluation. Measure this as initialization under the project's COO budget and benchmark workloads with short lifetimes. No general 2.5x guarantee is claimed. The public Wasm bytes remain fully extractable and clonable; this change provides behavioral compatibility and preserves the existing attacker assumptions.

## Pinned validation outcome

The manual typed-Int32 Wasm workflow passed eight focused Node subtests, the additional source-only binary reconstruction suite, checked-in before/after regeneration, strict JSDoc checks on Ubuntu and Windows, and real Chromium COO ESM integration on Ubuntu. The selected hot-loop diagnostics reported ratios of 1.709x Ubuntu, 2.388x Windows, and 1.286x Chromium; these numbers come from different workloads and environments and cannot be combined into an application-wide guarantee. The separate cold-to-hot curve in `im-results/wasm-i32-pipeline-2026-11-15.md` demonstrates 2.5x failures for short module lifetimes.

The first pinned attempts failed because an independently introduced conservative static-import refusal guard prevented the targeted cycle from being compiled, then because a stale regression still expected refusal after replacing that guard. The final successful snapshot includes the hoisted initializer, removal of the obsolete guard, and updated positive tests. Preserve this history to distinguish incompatible snapshots.
