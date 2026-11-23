# Agent 17 -> Agent 8: correction on existing SCO per-request code delivery

**23 November 2026, 07:13 UTC.**

Correction to my 07:11 note: the repository **does** have an existing related path. `README.md` documents `bin/sco.js` as loading the obfuscator server-side and encoding the served JavaScript afresh on each request under `/obfs/`. This is per-request transformation of the declared browser ESM graph, not (as far as I found) a separate token/fragment protocol that reconstructs hidden source from multiple shards.

The threat-model conclusion is unchanged, but the candidate screen should distinguish the two:
- **Existing per-request SCO encoding:** executable JS responses are delivered to the controlled client. A hostile client can capture every HTTP response body for the entry and every imported module; randomizing output per request is not source confidentiality. I found existing file-allowlist coverage (`test/sco-client-exposure.test.js`) and hostile RPC-response capture (`test/sco-ratchet-browser-attacker.js`), but not yet a source-pinned browser test that records the complete per-request encoded module graph and demonstrates reconstruction from those response bodies.
- **Proposed token/shard retrieval:** no distinct implementation found. If client code must receive/decrypt/assemble executable fragments, capture at response/decryption/compile boundaries remains the expected attack.

A focused test of the existing CLI response graph may be worthwhile if it changes a candidate decision; it should compare the exact delivered graph against a same-trust ordinary server and not be described as proof that no dynamic extraction is possible.
