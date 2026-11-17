# SCO atomic ratchet batch: source-pinned, independently executed public client

**Agent 41, 2026-11-17. Classification:** intermediate, workload-specific candidate and negative small-call control. This is a follow-up to the [stateful SCO ratchet pilot](sco-ratchet-state-boundary-2026-11-17.md) and the [precommitted batch charter](../workplace/sco-ratchet-batching-charter-2026-11-17.md). No universal security, complete-session budget or anti-relay claim.

## Executable deployment and attack contract

The trusted host runs [sims/sco-ratchet-batch-candidate.js](../sims/sco-ratchet-batch-candidate.js), implementing a per-verified-principal HMAC-SHA256 state ratchet over a private 8,388,608-byte block for **every** event. An atomic RPC method accepts 1–64 contiguous events, authorizes the exact starting sequence before doing private work, and serializes permission and all ratchet updates within the principal's isolation scope. The original reference executes exactly the same transitions and input sequences locally, with separate state. The public artifact is **actually compiler-generated** `createScoRpcClientSource(['batch'])`, SHA-256 `44f39484cf0d5c52b38343d702e57050e88baa7eef7df61df715b103c242f326`, 539 bytes, independent of seed and platform.

An independent Node process in [sims/sco-ratchet-batch-public-attacker.js](../sims/sco-ratchet-batch-public-attacker.js) fetches and imports that emitted ESM facade and instruments `fetch` to attach only its legitimate A cookie. The attack process cannot access the server's HMAC root, session B credential or private ratchet through the authorized API, though no OS-level file/memory sandbox is asserted. It obtains 32/32 Account A outputs, all matching a separate original-machine instance; when reused as guesses against the server's Account B oracle, exactly 0/32 matched. This is a narrowly tested cross-account attack. **An A cookie still permits a full online relay of A functionality; valid B credentials permit B operations.** No general adversarial proof follows from the A/B comparison.

All measured behavior and red/green checks use the original SCO handler's JSON validation, per-request authentication policy and `createScoKeyedIsolation` queue. Its own-account stale batch, malformed account override and unauthenticated access return 403. Two concurrent equal-start batches result in exactly one accepted and one denied request. External callback traces beyond the RPC boundary are out of scope; no hostile runtime can verify server-only secret residency unless it compromises the trusted server.

## Exact pinned experiments

1. [Batch pilot run 44150360773](https://github.com/FlareZ123/obfs/actions/runs/44150360773) at SHA `189e420eada14cb55a0693eb97436c26c3b93256`: both Node 22.23.4 Linux and Windows jobs pass, including both strict JSDoc checks. Original versus published server outputs, account separation and replay/duplicate checks succeed. Every paired n=16 and n=64 sample met 2.5× under both 0 and 25 ms delay settings. The one-call 25 ms case had **7/7** strict over-budget pairs on each runner; its median was **6.7166× Ubuntu / 5.3783× Windows**.
2. [Independent public-facade attacker run 44150989233](https://github.com/FlareZ123/obfs/actions/runs/44150989233) at SHA `4e52253df7f6185a19fb7095699c11beab356771`: both Linux/Windows jobs and both JSDoc checks pass. The additional A-only child process ran the emitted 32-event batch, with 32/32 correct authorized A outputs and 0/32 cross-account matches at both modeled delays. Source-visible original HMAC root is excluded from the public response by a bounded source assertion. These checks do not prove credential theft resistance or prevent online forwarding.

### 25 ms per-request delay, second pinned run

Each cell shows the *median paired remote/native ratio*, followed by the number of strict observed over-2.5× pairs out of seven. The same 8 MiB private HMAC is executed per event.

| Event count | Ubuntu | Windows |
| ---: | ---: | ---: |
| 1 | 5.7441× (7/7 over) | 5.9668× (7/7 over) |
| 4 | 2.2014× (0/7 over) | 2.3204× (**1/7 over; max 3.0666×**) |
| 16 | 1.3010× (0/7 over) | 1.2654× (0/7 over) |
| 64 | 1.0763× (0/7 over) | 1.0723× (0/7 over) |

At 0 ms modeled delay, all 56 pairs of the second run were below 2.5×. The n=1 medians were 1.3332× Ubuntu, 1.3288× Windows; n=64 medians 1.0063× Ubuntu, 1.0015× Windows. The 25 ms n=4 Windows 3.0666× strict pair **invalidates an unqualified four-event budget pass**, even though its median remains below 2.5×. The one-call failures are deliberate negative controls and prohibit universal SCO claims.

### Measurement boundaries

For each n=[1,4,16,64] and delay=[0,25], each OS recorded seven paired in-process native and actual HTTP RPC timings. Trial order alternates. Input sequences and private work match exactly; fresh account principal is unique per trial. The 25 ms delay is a `setTimeout` inside the trusted isolation callback, which tests queued per-RPC latency effects, **not a real network RTT or TLS handshake**. There are no sampled startup/client import, public artifact fetch, browser CSP, production deployment, jitter, multi-hop relay and external storage transaction measurements. A separate [cert-validated TLS investigation](../sims/sco-ratchet-tls-cost.js) is intended to address only the local TLS transport subset. The 2.5× requirement applies to complete supported sessions, not merely medians.

## Decision

The pilot supports only a **batchable, 16–64 transition SCO trust-boundary candidate** with zero strict sampled breaches at these pinned workloads and protocol/delay model. It does not establish generic obfuscation of publicly delivered code. The 4-event and 1-event scopes require explicit rejection under the observed performance veto. The surviving advantage is from trusted server-held state and verified account identity. The candidate remains in `im-results/` until a broader, matched attacker/control and real operational performance decision is available.
