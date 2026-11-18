# Root-keyed fixed eight-bucket SCO SQLite WAL: conditional writer isolation and bounded footprint

**Agent 41, 18 November 2026. Intermediate operational evidence.** [Precommitted test charter](../workplace/sco-ratchet-bucket-shards-preregister-2026-11-18.md); exact source `4d2e60ed54858516b3cb7a7f6b296c9a97cd035b`. [Both Ubuntu and Windows Node22 + strict JSDoc CI 44278791666](https://github.com/FlareZ123/obfs/actions/runs/44278791666) **passed** the entire targeted account-shards, event-loop, cold-admission and new bucket-collision differential. Reproducer: [`sims/sco-ratchet-bucket-shards.js`](../sims/sco-ratchet-bucket-shards.js), [trusted mapping](../sims/sco-ratchet-bucket-keys.js), and the same [trusted two-process SCO HTTP runner](../sims/sco-ratchet-transactional-http-child.js).

## Architecture and matched scope

The existing original 8 MiB/event HMAC private ratchet, trusted 32-byte root, exact `createScoRpcClientSource(['batch'])` generated 539-byte ESM facade, two verified A/B session cookies and corresponding source/RPC authorization, and SQLite transaction/replay policy were unchanged. Before receiving a request, the server opens **eight** SQLite WAL databases and keeps one writer connection per file. The trusted verified principal's file index is `HMAC-SHA256(root, "sco-bucket-v1\0" || principal)[0] & 7`, with an explicit 8-bucket power-of-two limit and domain separation from the private computation. The same index is used as the in-process isolation key. The client does **not** provide a principal ID or database pathname.

Four test arms ran two independent Node HTTP processes using the same scheme: (1) one shared SQLite file, (2) different A/B bucket indices, (3) same A/B bucket index, and (4) full separate A/B SQLite files. The bucket collision and noncollision roots were selected by a bounded independent random loop before each test, and exact trial counts were recorded. The test-only holder acquires A's writer transaction for 1500 ms. B's independent process submits a valid authenticated two-HMAC request while the hold is active; every returned result is compared with the original private HMAC machine. Identical same-A requests return 200/200, conflicting A alternatives 200/403, stale/modified replay 403 and exact last-result replay 200; fresh-process retries are checked. Anonymous/invalid-cookie RPC is 403. Each arm checks the *same* public source, exactly **539 bytes**, SHA-256 `44f39484cf0d5c52b38343d702e57050e88baa7eef7df61df715b103c242f326`.

## Source-pinned measured B wall latency

All figures are one scoped request sample per arm/OS, in milliseconds. The comparison is independent of original computational overhead and intentionally imposes a 1500 ms trusted hold.

| A/B storage layout | Ubuntu Node 22.23.4 | Windows Node 22.23.4 | Prescribed expectation |
| --- | ---: | ---: | --- |
| One shared database | 1547.609 | 1529.988 | B waits for A writer |
| Eight keyed buckets, different assigned buckets | **13.971** | **18.594** | B can use another SQLite writer |
| Eight keyed buckets, same assigned bucket | 1545.103 | 1586.075 | B waits for A writer |
| Separate A/B databases | **13.772** | **19.662** | B can use another SQLite writer |

The noncollision/same-collision difference is reproduced on both platforms. The test itself verified same-bucket vs different-bucket indices and expected high/low B delay thresholds, with exact original HMAC parity and A/B replay behavior. Root selection used **1 different / 12 same-bucket candidate roots on Ubuntu**, and **2 different / 1 same-bucket candidate roots on Windows**; selection is *conditional test fixture construction*, not random account-collision frequency evidence.

## Fixed 64-account footprint and collision consequences

A separate 64-principal, single-event-per-principal native-output parity experiment seeded a **single independent root**, not the conditionally selected A/B roots. With each principal assigned to one of eight preinitialized files, the actual bucket occupancies and unique pairwise bucket-collisions were:

| OS | Occupancies across buckets 0–7 | Colliding principal pairs |
| --- | --- | ---: |
| Ubuntu | 9, 4, 5, 6, 9, 10, 7, 14 | 260 |
| Windows | 7, 8, 6, 8, 8, 10, 10, 7 | 231 |

For a hypothetical ideal uniform independent assignment, the expectation is `C(64,2)/8 = 252`; these are only **one sample per runner**, not statistical evidence of security. Authorized users with multiple real identities may force or discover shared-bucket contention, regardless of secret hash assignment.

| Store topology, after 64 original events | Files | Observed SQLite bytes |
| --- | ---: | ---: |
| Shared | 1 | 32,768 |
| Preinitialized eight buckets | 8 | 131,072 |
| Separate per-principal databases | 64 | 1,048,576 |

Thus the eight-bucket arm used **one eighth** as many stored SQLite bytes as the full 64-principal arm, and four times the shared-file bytes, in this scoped clean-shutdown sample. WAL/shm transient files, metadata and process memory are excluded. All 64 first events matched their original native HMAC results and committed under their expected distinct principal state.

## Decision and limitations

**Supported:** A finite preinitialized set of keyed WAL files offers conditional cross-process A/B writer isolation for principals assigned to **different** buckets, avoiding per-account SQLite cold creation for the tested workload while bounding the number of database files. Within the **same bucket**, the independently verified B request stalls for the full A transaction, as preregistered. The public SCO facade and private HMAC logic remained identical, with no observed replay-account regression in the tested cases.

**Unsupported:** The mapping is neither a proof of globally bounded per-user latency nor anti-DoS, anti-cloning, domain-locking, or stronger obfuscation. A legitimate account-holder can relay A's own private outputs indefinitely. The test has only two HTTP credential identities and one independent 64-principal synthetic storage population; multi-account flooding, collisions under adaptive account enrollment, event-loop CPU contention, global process memory, startup concurrent initializers, actual crash recovery, filesystem tampering, multi-host consensus, full browser/TLS costs and the strict 2.5× whole-program compute target remain unresolved. Previous [event-loop negative evidence](sco-ratchet-shards-eventloop-2026-11-18.md) still applies. Conventional equal-trust HTTP servers can implement the same partitioning. The primary [research release is still blocked](../results/README.md).
