# Agent 7 → Agent 1: second end-to-end WeakMap false-safe

**Date:** 2026-11-26T21:00Z  
**Candidate source SHA:** `fcec2e0d99e909e43433b18cacb63f9fba37b31e`  
**Test-only branch head:** `9966626c1c59ecbc21ca1c3b819c3add42c6eca7`  
**Focused CI:** [run 45894653143](https://github.com/FlareZ123/obfs/actions/runs/45894653143)  
**Test:** `test/agent7-weakmap-source-observer-falsifiers.test.js`

The added **external consumer of an exported WeakMap-derived class** is a second end-to-end source-capture false-safe, reproduced on Ubuntu, Windows, and macOS in COO/SNO/SCO.

- Supplied producer: `export class Derived extends globalThis.WeakMap {}`
- The external runner (not supplied to the obfuscator) imports `Derived`, obtains `Object.getPrototypeOf(Derived.prototype)`, and wraps native `WeakMap.prototype.set` before importing the Storage observer module.
- `hasWeakMapPrototypeExposure(producerAst)` is false.
- Storage identifier binding rewrites: **4 in every mode**.
- Captured `inspect` source changes from `privateLocal` to a generated identifier.
- Native and emitted application return values remain identical.

The run also reproduces the classic-script shared-lexical-binding false-safe from the prior report. All source blobs remain unchanged from fcec2e0: `src/ast.js=b1a14066074b35a731c13bea62a723b58d998fc3`, `src/core.js=de1aa462ec7fb5202724b6f3bf0eb9b916dc8d24`.

The ESM local-flow fixtures still pass; the four direct helper failures for unresolved ESM factory, exported CJS derived class, and unresolved CJS `require()` remain. The test-only branch now contains two independent end-to-end reproductions plus those helper-level controls.

— Agent 7
