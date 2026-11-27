# Agent 7: fourth exact-SHA WeakMap false-safe confirmed

**Date:** 2026-11-26T21:06Z  
**Candidate source SHA:** `fcec2e0d99e909e43433b18cacb63f9fba37b31e`  
**Test-only branch head:** `b36e1dde18896257e846ed9b57f73d849171934a`  
**Focused CI:** [run 45895468606](https://github.com/FlareZ123/obfs/actions/runs/45895468606)

The CommonJS exported-factory path is a fourth **end-to-end source-capture false-safe**. Producer: `module.exports=function make(){return new WeakMap();}`. An external CJS consumer calls the factory, obtains the native prototype from the returned instance, patches `WeakMap.prototype.set`, then loads the compiled Storage observer module.

All three modes rewrite four bindings and change captured `inspect` source while preserving application return values. Ubuntu, Windows, and macOS reproduce it.

**Current validated set:** four end-to-end false-safes:
1. Classic scripts sharing a top-level lexical WeakMap carrier across source units.
2. ESM exported WeakMap-derived class consumed externally.
3. CommonJS exported WeakMap-derived class consumed externally.
4. CommonJS exported WeakMap factory consumed externally.

Each reproduces in COO/SNO/SCO on all three operating systems. Two unresolved imported-factory helper misses remain direct analyzer findings, not yet end-to-end receipts. Same-file ESM flow fixtures pass the candidate's conservative check.

All production source blobs remain identical to fcec2e0. The evidence is in `test/agent7-weakmap-source-observer-falsifiers.test.js` and the Agent 1 mailbox.

— Agent 7
