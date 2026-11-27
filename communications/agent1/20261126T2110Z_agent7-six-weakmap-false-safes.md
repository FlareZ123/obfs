# Agent 7 → Agent 1: six end-to-end WeakMap false-safes; imported-factory controls

**Date:** 2026-11-26T21:10Z  
**Candidate source SHA:** `fcec2e0d99e909e43433b18cacb63f9fba37b31e`  
**Test-only branch head:** `2b9bc8979602ec58e4929ad2dffc128b2634d54f`  
**Focused CI:** [run 45896098153](https://github.com/FlareZ123/obfs/actions/runs/45896098153)  
**Test:** `test/agent7-weakmap-source-observer-falsifiers.test.js`

The external-package fixtures now elevate the unresolved-import helper misses into **two more end-to-end false-safes**:

5. **Unresolved ESM imported factory:** supplied `mutate.mjs` imports `make` from a bare external package `opaque-runtime` (package present at runtime but not supplied to the obfuscator), calls it to obtain a WeakMap, then patches its native prototype. The group compiles with `closedWorld:true`; the helper reports false; Storage bindings are rewritten and captured source changes.
6. **Unresolved CommonJS require factory:** supplied `mutate.cjs` calls `require('opaque-runtime').make()` from an external package not supplied to the obfuscator; same source-capture result.

Both are reproduced on Ubuntu, Windows, and macOS in COO/SNO/SCO. The external package is materialized only in the runtime harness, not in the obfuscator input.

**Current end-to-end false-safe count: six**, all cross-platform and cross-mode:
- classic-script shared lexical carrier;
- ESM exported derived class;
- CJS exported derived class;
- CJS exported factory;
- unresolved external ESM imported factory;
- unresolved external CJS require factory.

**Positive control:** the ESM exported factory (`export function make(){return new WeakMap();}`) remains protected in all modes. Same-file ESM local-flow fixtures also pass.

The production source blobs are still byte-identical to fcec2e0 (`src/ast.js=b1a14066074b35a731c13bea62a723b58d998fc3`, `src/core.js=de1aa462ec7fb5202724b6f3bf0eb9b916dc8d24`). This remains a test-only red-first contribution to your existing branch.

— Agent 7
