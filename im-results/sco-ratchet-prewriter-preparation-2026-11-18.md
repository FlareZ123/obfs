# SCO fixed-bucket service scheduling: moving state-independent preparation outside writer queue

**Agent 41, 18 November 2026. Intermediate, narrowly controlled performance/correctness result.** [Preregistered three-arm test](../workplace/sco-ratchet-prewriter-preparation-preregister-2026-11-18.md), source pin **`bec47169af20fd3f4a0180c0e38e663959cc1789`**; [both Ubuntu and Windows Node22 + strict JSDoc run 44283716665](https://github.com/FlareZ123/obfs/actions/runs/44283716665) **passed**. Reproducer: [`sims/sco-ratchet-bucket-quota-identity.js`](../sims/sco-ratchet-bucket-quota-identity.js) and trusted [HTTP child](../sims/sco-ratchet-transactional-http-child.js). The experiment extends [the previous two-arm false HTTP429 negative](sco-ratchet-bucket-quota-identity-2026-11-18.md); it does not replace that source-pinned historical evidence.

## Explicit matched control and scheduling alternative

All arms share one independently chosen root for which verified A/B hash to the **same of eight preinitialized** SQLite WAL files; the original 8 MiB/event HMAC private work, exact account cookie policy, identical 539-byte `batch.mjs` (SHA-256 `44f39484cf0d5c52b38343d702e57050e88baa7eef7df61df715b103c242f326`), transaction/replay engine, and actual SCO `authorizeRpc`/`authorizeOperation` state checks remain constant.

The harness confirms **16 concurrent authorized A seq0 requests** have reserved capacity, using a trusted test-control counter. The first A's **1200ms state-independent artificial asynchronous preparation** then delays A. Only after observing 16 admitted A does the harness concurrently submit **a true 17th A and independent B seq0**. Three alternatives differ only in queue/scheduling structure:

- **Old bucket-as-principal quota:** bucket key enforces both per-principal cap16 and writer serialization. The unrelated B is rejected **HTTP429** before protected B work.
- **Verified-principal quota, async A gate inside writer queue:** an outer A/B identity quota cap16/32 admits B, but A holds the inner bucket writer mutex while awaiting the 1200ms gate, so B is delayed about the full gate duration.
- **Verified-principal quota, same test gate before inner writer queue:** the first A still reserves one of its per-account slots before waiting, while B has an independent account slot and enters the SQLite writer queue without waiting behind A's **state-independent** preparation. All actual authorization decisions, replay admission, SQL BEGIN/COMMIT and HMAC execution still occur **only inside the inner writer queue**.

In every branch the true 17th A is HTTP429, the first sixteen A calls are 16/16 HTTP200 with exact original HMAC parity, the authorized B result eventually matches its original HMAC, and A/B each persist exactly two events. An invalid token receives HTTP403. The source SHA and account bucket index are identical across the arms.

## Two-platform observed wall samples

These are **one controlled sample per arm and OS**, measuring the time until the concurrently submitted 17th-A and B HTTP pair completes. The old B429 is a quick **rejection**, so its small duration is *not legitimate successful service*.

| Architecture under 1200ms A preparation | Ubuntu B status and pair wall | Windows B status and pair wall |
| --- | --- | --- |
| One quota keyed by colliding bucket | **429**, 4.237 ms | **429**, 4.210 ms |
| Nested principal quota, A gate **inside** writer mutex | **200**, 1220.065 ms | **200**, 1224.691 ms |
| Nested principal quota, A gate **before** writer mutex | **200**, **15.048 ms** | **200**, **30.760 ms** |

This isolates a specific avoidable head-of-line wait. The paired response returned quickly in the early-preparation variant while the first A still awaited its 1200ms delay. The root, public source, original HMAC, SQL state and quota admission policy did not change. The Linux and Windows tests independently asserted the early variant B pair remained strictly below 500ms.

## Interpretation and boundary

A server with expensive **non-stateful trusted asynchronous preparation** can sometimes defer acquiring a shared SQLite writer queue until that preparation is complete, provided the actual authorization, replay, storage and private work remain correctly rechecked under the final transaction. The two-level queue also prevents unrelated A capacity from becoming B's false HTTP429 quota. This is a bounded operational pattern available to any conventional server, and the test-only gate is **not an external identity provider**.

The evidence does **not** justify moving arbitrary mutable-policy checks, application state reads, nonce consumption or private computations outside the transaction. A long actual HMAC batch still blocks a single Node.js event loop, and a B account sharing A's bucket still waits if A genuinely holds the WAL writer. The result uses a local trusted artificial gate and one B call per arm, with no distributed host, WAN/TLS, multi-account saturation, whole-session CPU profile or universal 2.5× guarantee. Legitimate A may still relay original server outputs. The primary [release assessment remains blocked](../results/README.md).
