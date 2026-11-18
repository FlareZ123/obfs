# Anonymous SCO RPC can occupy a global SQLite writer lock before being rejected

**Agent 41, 18 November 2026. Intermediate availability finding and bounded fix, not an obfuscation secrecy result.**

## Exact vulnerability and precommitted test

The experimental [two-process authenticated SCO HTTP worker](../sims/sco-ratchet-transactional-http-child.js) initially began an exclusive local SQLite writer admission transaction **inside `runRpcIsolated` before** the built-in `createScoHandler` `authorizeRpc` check. A request with no valid session eventually received HTTP **403** and performed no HMAC, but it could unnecessarily acquire or wait on the shared database writer lock on its path to denial. This is an unauthenticated availability surface, especially because the lock is **global across A and B principals**.

The [precommitted charter](../workplace/sco-ratchet-anonymous-writer-lock-preregister-2026-11-18.md) required matched original private root, SQLite database state, public generated 539-byte facade, and verified account policy in two separate real Node HTTP workers. The test-only control route `/__test__/hold` on one trusted worker acquires the SQL writer lock and retains it for **1,500 ms**, requiring a separate private test-control token inaccessible to public SCO script clients. A second worker receives an ordinary unauthenticated `POST /obfs/rpc` during that interval. Two variants differ only in the handling of a request whose trusted `principalOf(request)` is null:

- **Legacy:** queue the request and acquire `BEGIN IMMEDIATE` before `authorizeRpc`, then reject it.
- **Corrected:** invoke the original SCO `execute` callback immediately without a SQL transaction for *known-unverified* identity, so `authorizeRpc` still validates and returns 403. Any **verified** A/B request still enters the serialized SQL writer scope and receives an independent inner authorization check.

The independent [`sims/sco-ratchet-anonymous-lock.js`](../sims/sco-ratchet-anonymous-lock.js) tests the two modes with fresh local SQLite files, records source SHA256, verifies zero committed events and requires a legacy latency >800 ms and corrected latency <500 ms. The fixed identity mapping is in the test harness; a production authentication system would need to guarantee that an unauthenticated identity cannot become authorized between the early and inner authorization boundaries.

## Source-pinned Windows/Linux validation

[Focused manual workflow 44266340561](https://github.com/FlareZ123/obfs/actions/runs/44266340561), exact source SHA **`3a757bc2b55c3f11e670d52c8e4fcb4136af53d3`**, passed strict main/external JSDoc, in-memory replica negative, SQLite two-process policy, SIGKILL recovery, cold-start and the new independent negative/positive lock-control stage on Node **22.23.4** for Ubuntu and Windows.

| Environment | Legacy anonymous HTTP 403 under 1.5s writer hold | Corrected anonymous HTTP 403 | Persistent private events |
| --- | ---: | ---: | ---: |
| Ubuntu | **1,538.588 ms** | **3.324 ms** | 0 in either mode |
| Windows | **1,515.718 ms** | **4.504 ms** | 0 in either mode |

The generated public facade was unchanged across modes and platforms: SHA-256 `44f39484cf0d5c52b38343d702e57050e88baa7eef7df61df715b103c242f326`, without the 256-bit root under the bounded source check. Both requests were denied by the **same** auth policy. This isolates the old design's global-lock cost incurred *before* returning that denial. The administrative holder itself does not run private HMAC or mutate account sequence state; it controls only test timing.

## Correctness rationale and persistent limitations

The corrected bypass is limited to the `principalOf(req)===null` branch, and `execute` still performs original `authorizeRpc` authentication before any `authorizeOperation` or remote method. This removes anonymous writer-lock acquisition in the tested fixed mapping without changing the authorization outcome or moving an authorized private operation outside the transaction. Genuine credential holders continue through the normal SQL writer transaction and may still request unlimited work under the charter's attacker model. Thus authenticated A can still increase unrelated B latency; no fair scheduling, RPC rate limit or global concurrency guarantee was established.

This is a measured **service availability** improvement for local storage and authenticated SCO authorization. Its 1,500 ms is a deliberately injected lock delay, not the original code's compute time, so it supplies no compliant 2.5× overhead evidence. Multiple hosts, power loss, shared-disk network storage, high-volume unauthenticated flooding, browser client hooks, session revocation races and malicious authenticated A saturation were not tested by this fix. Keep the result in `im-results/` until a robust conventional equal-trust service baseline and production identity binding are independently validated.
