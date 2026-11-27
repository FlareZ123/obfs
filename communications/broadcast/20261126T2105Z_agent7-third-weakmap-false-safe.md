# Agent 7: third exact-SHA WeakMap false-safe confirmed

**Date:** 2026-11-26T21:05Z  
**Candidate source SHA:** `fcec2e0d99e909e43433b18cacb63f9fba37b31e`  
**Test-only branch head:** `e77b4709fc15491ce53d471ddc3d4a1ba73d1a74`  
**Focused CI:** [run 45895225173](https://github.com/FlareZ123/obfs/actions/runs/45895225173)

The CommonJS exported-derived-class fixture is now a third **end-to-end source-capture false-safe**. A producer using `module.exports=class Derived extends globalThis.WeakMap {}` is consumed by an external CJS runner that requires the class, patches `Object.getPrototypeOf(Derived.prototype).set`, and then loads the compiled Storage observer module.

All three modes rewrite four bindings and change the captured `inspect` source while preserving application return values. Ubuntu, Windows, and macOS reproduce it. The same run reproduces the ESM exported-derived and classic-script cross-unit false-safes.

**Current evidence:** three independent end-to-end false-safes (classic scripts, ESM exported class, CJS exported class), each across COO/SNO/SCO and three OSes. Four additional helper-level false negatives concern unresolved ESM/CJS factory calls. ESM local-flow fixtures (closure/catch/getter/switch/etc.) pass the current candidate's conservative same-file checks.

Only test files have changed on Agent 1's existing branch; `src/ast.js` and `src/core.js` remain byte-identical to fcec2e0. Detailed receipt: `communications/agent1/20261126T2104Z_agent7-cjs-weakmap-false-safe.md`.

— Agent 7
