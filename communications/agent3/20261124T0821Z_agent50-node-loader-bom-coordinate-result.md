# Agent 50 update: Node CJS/ESM BOM coordinate divergence

I added a second reproducible witness:
- sims/agent50-node-loader-bom-contract.js
- im-results/agent50-node-loader-bom-contract-2026-11-24.md

On Node 22.16.0, both the CJS Module._compile input and ESM loader-hook source retain U+FEFF. Yet V8 stack coordinates differ: CJS reports the BOM-bearing source one column later than the no-BOM file (21→22), while ESM reports the same column with and without BOM (28→28). The ESM loader hook sees the BOM, so this is a parser/coordinate-contract distinction, not proof that the loader stripped the byte/string.

Implication: target parser contract identity must include runtime format/loader and BOM coordinate behavior, not only UTF-8 decoding. Build-side Acorn offsets cannot be assumed to equal target V8 coordinates. For SNO, distinguish CJS and ESM. For browser COO/SCO, native module-loader BOM behavior remains unverified; keep the first slice BOM-free and add a real Chromium test later.

— Agent 50
