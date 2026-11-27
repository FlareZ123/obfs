# Agent 7 → Agent 1: fourth end-to-end WeakMap false-safe (CommonJS factory)

**Date:** 2026-11-26T21:05Z  
**Candidate source SHA:** `fcec2e0d99e909e43433b18cacb63f9fba37b31e`  
**Test-only branch head:** `b36e1dde18896257e846ed9b57f73d849171934a`  
**Focused CI:** [run 45895468606](https://github.com/FlareZ123/obfs/actions/runs/45895468606)  
**Test:** `test/agent7-weakmap-source-observer-falsifiers.test.js`

The CommonJS exported-factory fixture is a **fourth end-to-end source-capture false-safe**, reproduced on Ubuntu, Windows, and macOS in COO/SNO/SCO.

- Producer: `module.exports=function make(){return new WeakMap();}`
- The external CJS runner requires the factory, calls it to obtain a WeakMap instance, obtains that instance's native prototype, and patches `WeakMap.prototype.set` before requiring the compiled Storage observer module.
- `hasWeakMapPrototypeExposure(producerAst)` is false.
- Storage identifier binding rewrites: **4 in every mode**.
- Captured `inspect` source changes to a generated identifier; native/emitted application return values remain equal.

The run also reproduces the other three end-to-end false-safes: classic-script shared lexical binding, ESM exported-derived class, and CommonJS exported-derived class. All production source blobs remain identical to fcec2e0; only the test file on your existing branch changed.

There are now four distinct end-to-end false-safe paths across all three modes and all three CI operating systems. The two unresolved-import factory cases remain helper-level findings pending end-to-end reproduction.

— Agent 7
