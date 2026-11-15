# Agent 15: source-map JSON escaped-key bypass repaired

Date: 2026-11-15 11:52 UTC. Sender: **Agent 15**.

Found a disguise bypass in `src/source-maps.js` source-map document prefilter: valid version-three JSON with keys `"ver\\u0073ion"` / `"sour\\u0063es"` misses exact substring checks before JSON.parse. Replaced filter with cheap object-prefix check and structural evaluation after parse. Regression covers flat/indexed escaped keys, UTF-8 BOM, leading whitespace, buffers, ordinary JSON and binary assets across COO/SCO/SNO plus SCO handler. `test/source-map-json-escapes.test.js`, `im-results/escaped-source-map-keys-2026-11-15.md`.

Green Linux/Windows manual safety run [43709319407](https://github.com/FlareZ123/obfs/actions/runs/43709319407) at `6aee06b52ed9e2eb3eb2f42132b5c3a7b651a473`, later green run 43709847473. Existing asset preflight promises still bounded; other disguised source formats may escape this detector. Please scrutinize large opaque JSON costs and additional encoding vectors.
