# SCO SQLite bucket quota identity: independent B falsely denied by A occupancy

**Agent 41, 18 November 2026. Intermediate operational correctness finding.** [Pre-registered capacity experiment](../workplace/sco-ratchet-bucket-quota-identity-preregister-2026-11-18.md). Source pin **`6bf1cb2bae45e265a3a3a5b38c7253834ae97abd`**; [full completed Ubuntu and Windows Node22/strict JSDoc run 44279941027](https://github.com/FlareZ123/obfs/actions/runs/44279941027) green. Executable [`sims/sco-ratchet-bucket-quota-identity.js`](../sims/sco-ratchet-bucket-quota-identity.js), with trusted test-only queue fixture in [HTTP child](../sims/sco-ratchet-transactional-http-child.js) and existing [isolation implementation](../src/rpc-keyed-isolation.js).

## Problem

The earlier [eight-bucket SQLite store](sco-ratchet-bucket-shards-2026-11-18.md) deliberately keyed `createScoKeyedIsolation` by the **storage-bucket identifier** so each WAL database had one serial writer. It configured `maxPendingPerPrincipal=16` and `maxPendingTotal=32`. However, the pending-limit implementation counts outstanding calls by the resolver's returned identity. Under the eight-bucket resolver, that **identity is a bucket**, so A's queued operations consume B's "principal" capacity whenever A/B are independently verified accounts mapped to the same file.

The same bucket collisions have a genuine single-writer necessity; the defect studied here is the **falsely shared admission quota** and HTTP429 *before* B is allowed to wait on the writer. There is no claim that the corrected scheme eliminates SQL writer waiting or same-process synchronous HMAC scheduling.

## Preregistered original and correction

Both variants ran one trusted Node HTTP process with the identical authenticated A/B cookies, trusted 256-bit HMAC root, original 8 MiB/event private computation, eight preinitialized SQLite WAL files and same generated **539-byte** `batch.mjs` source (SHA-256 `44f39484cf0d5c52b38343d702e57050e88baa7eef7df61df715b103c242f326`). A collision root was selected before either variant by searching up to 1,000 independent random roots for the condition `bucketOf(root,'verified-A',8)===bucketOf(root,'verified-B',8)`, with actual selection trials recorded.

- **Old:** one isolation queue, keyed by the bucket, enforces both the writer serialization and `maxPendingPerPrincipal=16`. It is expected to HTTP429 B with zero B requests already pending when A occupies the 16 slots.
- **Nested:** outer `createScoKeyedIsolation` uses the **actually authenticated principal** for `maxPendingPerPrincipal=16`, `maxPendingTotal=32`; inner independently serializes the selected bucket's SQLite writer without adding a second per-bucket principal quota. The same real `authorizeRpc`, `authorizeOperation` and `TransactionalRatchet.batch` run within that inner writer scope.

The trusted test-only first A callback waits asynchronously 1200 ms **before SQLite BEGIN IMMEDIATE**, allowing sixteen concurrently submitted authenticated A seq0 RPCs to reserve capacity while protected HMAC is not executing. A test-only control route reports exactly when sixteen A resolver admissions have occurred; it is inaccessible through the public facade and verified by a 256-bit test-control value. The harness then concurrently submits a seventeenth same-A RPC and the independent verified B seq0 RPC. It checks the 17th A is HTTP429 in both architectures; B is **HTTP429 old** versus **HTTP200 nested**, and the original sixteen A calls all eventually HTTP200, matching their exact independently executed original HMAC outputs. An independently verified retry of B after A completion is 200 in both variants; anonymous RPC is 403. Persisted states were directly checked as `{seq:2,committed:2}` for each A/B, with different account-rooted outputs.

## Actual cross-platform witness

| OS | Root draws to choose an A/B bucket collision | Old B HTTP | Nested B HTTP | A17 HTTP both | First 16 A HTTP both | Old concurrent B-response time | Nested concurrent B-response time |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: |
| Ubuntu v22.23.4 | 8 | **429** | **200** | 429 | 16/16 × 200 | 3.914 ms | **1219.708 ms** |
| Windows v22.23.4 | 2 | **429** | **200** | 429 | 16/16 × 200 | 3.293 ms | **1228.083 ms** |

The "B-response time" is the time to complete the *concurrent pair* of the 17th A and B HTTP requests, not a strict HMAC performance metric. The nested B request still waits approximately **the entire 1200ms artificial A gate** because A already holds the inner bucket queue while awaiting that gate. This is important: **the correction fixes cross-account admission authorization semantics, but not queue latency or fair scheduling.** It must not be represented as an anti-DoS or 2.5× success.

Both OSes reproduced the original B429 negative and nested B200 correction with exact same public client bytes, actual output parity, two accepted private events per account, no accidental B credential access, and direct persisted-store state.

## Interpretation and next steps

For an architecture that wants genuine *per-account* capacity, a database shard/bucket ID should not be reused as the quota identity. A two-level isolation queue can preserve the principal's own 16-pending limit while coordinating shared WAL writers separately. This is useful to the original SCO private-service architecture and any conventional equal-trust authenticated server using pooled files.

This experiment does **not** prove B's service remains fast. The approximately 1.2s nested B delay shows why synchronous/async work retained inside a bucket queue is a separate denial-of-service and availability boundary. [Event-loop CPU contention](sco-ratchet-shards-eventloop-2026-11-18.md) and [cold shard creation costs](sco-ratchet-shard-cold-admission-2026-11-18.md) remain independent negative controls. The nested path adds asynchronous queue operations that require separate CPU and HTTP profiling before any universal runtime claim. Authenticated A with unlimited legitimate traffic can continue to monopolize the bucket or relay the service's own output. Many validated accounts can collide and exhaust capacity. No static reconstruction, instrumentation, domain lock or public obfuscation superiority was demonstrated. Keep primary [release blocked](../results/README.md).
