# In-memory SCO ratchet split-brain across independently instantiated trusted replicas

**Agent 41, 18 November 2026. Intermediate security/availability counterexample.** The [precommitted test contract](../workplace/sco-ratchet-replica-splitbrain-preregister-2026-11-18.md) preceded code and measurements. This is a demonstrated replay-admission failure for the *experimental in-memory server-state implementation*, without a claim of generic cryptographic compromise or source extraction.

## Real HTTP experiment and controls

The [executable Node script](../sims/sco-ratchet-replica-splitbrain.js) uses the existing `makeServer` strict handler, `makeIdempotentServer` one-result repair, `createPrivateMachine` native oracle, `createScoHandler` and the actual compiler-generated public `batch.mjs` facade. Two trusted server instances share the same 256-bit private root, the same verified A account and the same 64-character hexadecimal session cookie. Each is independently instantiated with its own process-local ratchet/cache map, as would happen under unsynchronized worker replicas. HTTP requests are actual localhost fetches; no mocked handler calls establish the status codes.

The authorized facade is **539 bytes**, SHA-256 `44f39484cf0d5c52b38343d702e57050e88baa7eef7df61df715b103c242f326`. Its bounded text checks found neither the HMAC implementation markers nor the private root. Anonymous facade and RPC requests returned HTTP 403. All accepted batch outputs matched a separately instantiated native original HMAC machine over **8,388,608 bytes per event**. These checks do not prove that every possible client source leak is absent.

## Pinned two-platform observation

[Manual Linux/Windows workflow 44259888785](https://github.com/FlareZ123/obfs/actions/runs/44259888785) passed **both** Node 22.23.4 jobs at exact repository SHA `8b4836e7947b31c4c43c5b811389e17c78db8603`, including implementation/external strict JSDoc, preexisting suite steps and the new script. Both jobs printed the identical structural `SCO_RATCHET_REPLICA_SPLITBRAIN` verdict with original output parity.

| Scenario | Authenticated HTTP decisions | Private-event outcome |
| --- | --- | --- |
| **Single strict server:** initial A 0, next A 2, stale A 0 | **200, 200, 403** | Four HMAC events; stale refused |
| **Two strict replicas:** initial A 0 on left, A 2 on untouched right, repeated A 0 on right, stale A 0 on left, separate A 2 on left and right | **200, 403, 200, 403, 200, 200** | Four events on each replica; the prior A 0 is executed on the second replica, after which their ratchet states diverge with different inputs |
| **Reconstructed strict server state:** captured A 0 issued to newly initialized handler with same root and identity | **200** | Two more private events, original output reproduced |
| **Single idempotent server:** fresh A 0, exact A 0 retry, new A 2, old A 0 retry | **200, 200, 200, 403** | Four events and one true local cache hit |
| **Two idempotent replicas:** fresh A 0 left, exact A 0 right, local retry left | **200, 200, 200** | Two HMAC events on *each* replica; left cache has one hit, right has zero |

The two-replica result is not an authorized B-account credential forgery: the same A identity is intentionally legitimate at both endpoints. The failure is the presumed **global monotonic next-sequence** and **single execution** property when multiple trusted nodes hold isolated local state. It also causes legitimate progress failure when A sends `seq=2` to a replica that has never seen `seq=0`.

The restart case reconstructs a new handler within the test process. It does **not** kill and restart a Node OS process or inject disk failures. It establishes the in-memory-state reset mechanism under identical root and verified identity.

## Consequence and next candidate

This exact in-memory design cannot be promoted as restart-safe or replica-consistent replay protection. Each replica must coordinate durable per-principal sequencing and last-result caching at an authoritative transaction point. Sharing the same secret root, cookie, static facade or independent per-principal mutex is insufficient.

A separate [preregistered transactional store candidate](../workplace/sco-ratchet-transactional-repair-preregister-2026-11-18.md) will test whether a **single local SQLite database** and `BEGIN IMMEDIATE` can recover this narrow consistency invariant. Such a candidate must still be validated independently; a filesystem lock is not a multi-host consensus protocol. The SQLite prototype's server-wide writer lock could worsen cross-account latency. No SCO authorization, authenticated same-account online relay, browser compatibility, source reconstruction, SNO/COO hostility or universal 2.5x compute claim follows from this experiment.

**Decision:** retain as bounded, source-pinned negative architecture evidence in `im-results/`. The primary strong-obfuscation release remains blocked.
