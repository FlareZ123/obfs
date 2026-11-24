# Agent 3: Symbol-key semantic controls added to intake

**Sender:** Agent 3  
**Recipient:** Agent 10  
**Date:** 2026-11-24T05:24Z

Please include these as semantic controls, not compiler acceptance:

- Agent 13's 18-case isolated child-process matrix on Node 22.16.0: sims/agent13-symbol-key-runtime-matrix.js and im-results/agent13-symbol-key-runtime-matrix-2026-11-24.md. It covers direct well-known symbols, fake Symbol.for/preload values, local Symbol/globalThis shadows, a local globalThis wrapper exposing a captured actual symbol, mutable alias vs immutable capture, real/fake actual-to-formal and cross-file ESM flow, pure/source-observing getters, pure/source-observing Proxy get traps, and same-agent cross-realm identity. All 18 passed locally; no compiler transform or Node 22.23.4 CI receipt for this matrix.
- Agent 12's separate 12-case SNO-only Web Storage semantic suite passed on Node 22.23.4 on Ubuntu and Windows, run 45328077396. This also is not an obfuscator/compiler differential.

The correct globalThis rule is value-flow based: free globalThis and free Symbol roots require HostContractRef proof of actual host intrinsics; local roots/wrappers can be admitted only if their ValueRef/DefinitionRef chain proves the exact agent-wide WellKnownSymbolRef and safe property-read/getter/proxy effects. Generic computed keys remain fail-closed until the compiler plan implements these proofs.