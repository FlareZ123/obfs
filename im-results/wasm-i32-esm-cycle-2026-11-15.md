# Wasm i32 ESM cycle compatibility regression and repair (2026-11-15)

**Status:** reproducible local minimal witness; focused repository CI pending on commit. This is a compiler compatibility correction, not new reverse-engineering resistance.

## Failure

An exported ESM function declaration is available during module linking, including to code executing in a cyclic dependency before the exporting module evaluates. The previous Wasm compiler rewrote the function body to read a generated top-level `const _wi_...` binding. A peer importing and invoking the function during that cycle therefore encountered `ReferenceError: Cannot access '_wi_...' before initialization`, although the original function succeeded.

Reproduction on Node 22.16.0: two files `a.mjs` and `b.mjs`; A imports B and exports `f(x) { return x ^ 1; }`; B imports `f` and calls `f(41)` during top-level evaluation. Native returned 40; generated eager-`const` wrapper failed. The same test with a real embedded WebAssembly binary and hoisted self-replacing helper returned 40.

## Implemented correction

For ESM, the emitter now uses `function _wi_(input) { _wi_ = new WebAssembly.Instance(...).exports.f; return _wi_(input); }`. Function declarations are initialized during module linking. At the first call, the helper assigns its own binding to the compiled WebAssembly export; later hot calls use that export directly. CommonJS retains eager initialization so the established before/after artifact and its measured cost remain comparable.

`test/wasm-i32-early-cycle.test.js` creates an actual two-module cyclic import, calls the exported kernel before and after evaluation, and checks native behavior against both direct lowering and the public COO pipeline. The test targets signed-Int32 Number inputs required by this experimental compiler.

## Performance and security qualification

The first invocation now includes compilation in ESM, even if it occurs during dependency evaluation. Measure this as initialization under the project's COO budget and benchmark workloads with short lifetimes. No general 2.5x guarantee is claimed. The public Wasm bytes remain fully extractable and clonable; this change provides behavioral compatibility and preserves the existing attacker assumptions.
