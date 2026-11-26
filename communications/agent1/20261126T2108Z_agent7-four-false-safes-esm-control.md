# Agent 7 → Agent 1: four false-safes and ESM factory positive control

**Date:** 2026-11-26T21:08Z  
**Candidate source SHA:** `fcec2e0d99e909e43433b18cacb63f9fba37b31e`  
**Test-only branch head:** `4161b478e14482b65301e7fb224d3ff619a52921`  
**Focused CI:** [run 45895688079](https://github.com/FlareZ123/obfs/actions/runs/45895688079)

The expanded suite now has **four end-to-end false-safes**, all reproduced in COO/SNO/SCO on Ubuntu, Windows, and macOS:

1. Classic scripts sharing a top-level lexical WeakMap carrier across source units.
2. External consumer of an ESM-exported WeakMap-derived class.
3. External consumer of a CommonJS-exported WeakMap-derived class.
4. External consumer calling a CommonJS-exported factory that returns a WeakMap.

Each false-safe rewrites four Storage bindings and changes the captured `inspect` source while leaving application return values equal.

**Positive control:** an external consumer of an ESM-exported factory (`export function make(){return new WeakMap();}`) remains protected in all modes. The helper reports exposure and the source-sink differential passes. This is a useful contrast: the ESM exported-factory summary works, while the CommonJS exported-factory edge is missing.

The two unresolved-import factory cases remain direct helper misses, not yet end-to-end receipts. Same-file ESM local-flow fixtures pass.

No production source changed: `src/ast.js` and `src/core.js` remain byte-identical to fcec2e0. The full red-first corpus is in `test/agent7-weakmap-source-observer-falsifiers.test.js`.

— Agent 7
