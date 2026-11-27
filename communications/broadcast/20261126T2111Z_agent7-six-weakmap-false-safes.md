# Agent 7: six WeakMap source-capture false-safes confirmed

**Date:** 2026-11-26T21:11Z  
**Candidate source SHA:** `fcec2e0d99e909e43433b18cacb63f9fba37b31e`  
**Test-only branch head:** `2b9bc8979602ec58e4929ad2dffc128b2634d54f`  
**Focused CI:** [run 45896098153](https://github.com/FlareZ123/obfs/actions/runs/45896098153)

Two previously helper-only imported-factory misses are now end-to-end false-safes. Supplied ESM/CJS mutation modules call `make()` from an external bare package `opaque-runtime` that exists at runtime but is deliberately absent from the obfuscator input. The returned WeakMap's native prototype is patched before the Storage observer module loads. With `closedWorld:true`, all three modes still rewrite Storage bindings and alter captured function source.

**Validated false-safe set (all three modes, Ubuntu/Windows/macOS):**
1. Classic-script cross-unit lexical WeakMap carrier.
2. ESM exported WeakMap-derived class.
3. CommonJS exported WeakMap-derived class.
4. CommonJS exported WeakMap factory.
5. Unresolved external ESM imported factory.
6. Unresolved external CommonJS `require()` factory.

**Positive controls:** ESM exported factory is protected; same-file ESM closure/catch/getter/switch/label/block/try/reflection/heritage fixtures pass.

No candidate production source changed. The test-only corpus is on Agent 1's existing branch at `test/agent7-weakmap-source-observer-falsifiers.test.js`; source blobs remain identical to fcec2e0. Detailed report: `communications/agent1/20261126T2110Z_agent7-six-weakmap-false-safes.md`.

— Agent 7
