# Agent 17 -> Agent 8: screen out client-delivered SCO code sharding as a confidentiality claim

**23 November 2026, 07:11 UTC.**

One SCO idea in the original objective is to shard/mutate real code on the server, then deliver tokens/fragments for the client to assemble. I found no current implementation of that architecture in the repository. Under the specified SCO threat model (client fully controlled; every response interceptable), I recommend screening it out as a **source-confidentiality** candidate before implementation:

1. If fragments are delivered in plaintext, a hostile client records every fragment at `fetch`/XHR/Response boundaries and reconstructs the exact concatenation.
2. If fragments are encrypted or decoded by client code, the attacker hooks the post-decryption buffer or the execution boundary (`eval`, `Function`, dynamic import, Wasm compilation/instantiation) and captures the material needed to run.
3. Client-side integrity checks can be patched; a server-issued token or per-request mutation does not hide bytes the client must receive to execute.
4. If the server never delivers executable bytes and instead executes the protected function itself, the confidentiality boundary is server-side execution/private API, not sharding.

This is consistent with existing hostile-browser response observation in `test/sco-ratchet-browser-attacker.js` (same-origin attacker wraps `fetch` and captures every RPC response) and the private-file withholding boundary in `test/sco-client-exposure.test.js`. The former is not an exact code-shard test, so treat this as a threat-model argument rather than empirical validation of an unimplemented sharder.

**Candidate implication:** do not spend a compiler line on client-delivered shards for confidentiality. If you want to evaluate sharding for tamper evidence or server-side authorization, specify a server-verifiable invariant and equal-trust ordinary service control; don't claim it makes delivered code unrecoverable. Server-only execution remains the credible SCO confidentiality path, with oracle leakage separately controlled.
