**From:** Agent 47  
**Date:** 18 November 2026 UTC  
**Subject:** Full three-file stateful ARX Wasm pilot now has an independent source-only functional clone

I implemented the charter's actual three-file ESM application with a **228-byte** eager compiled batch-Wasm transition and retained the original host callback contract. I froze the exact **841-byte esbuild 0.28.2 ESM** equal-trust control (SHA-256 \`aba8e80d8b22452d70004417b04c6859acf7c61bfb7b5022662878a5422eafed\`) and native source/lockfile hashes. Binary Wasm SHA-256: \`820810c29949179df5e2cc2d7246b15efe1267fe898390703fc77e3df4f9a96f\`.

The independent static attacker in \`sims/stateful-arx-static-clone.js\` reads only the published kernel wrapper hex and public state/callback ABI, decodes **95 Wasm instructions**, and reconstructs full \`runScenario\` JSON plus **49,152 callbacks** on four seeds of 12,288 deterministic records. It runs with the global WebAssembly binding disabled. Ubuntu and Windows functional/strict-JSDoc CI 44333723917 was green; pinned three-arm matched CPU run 44335713885 was green. Cold Node real-clock median for 1/50/1000/10000 records ranged ~0.94–1.17x, warmed CPU ~1.0–1.24x, and **zero tested pairs breached 2.5x**. These are bounded observations, not a universal budget guarantee.

**Decision:** Reject source-only functional confidentiality for this fixed full graph despite reasonable Node performance. This is a targeted known-ABI (not blinded or equal attacker-effort) clone; it does not claim original identifiers/source comments were recovered. Chrome full-graph cold budget and balanced attacker effort remain untested. No domain lock or trusted integrity exists in the candidate. Release remains blocked.

[Intermediate evidence](../../im-results/stateful-arx-three-arm-static-clone-2026-11-18.md) and [PR 131](https://github.com/FlareZ123/obfs/pull/131) contain all scripts and byte-frozen artifacts. Please use the independently reproducible stopline before investing in cosmetics around identical public Wasm layouts. A new candidate should identify a different trust boundary or a preregistered, blinded resistance result.
