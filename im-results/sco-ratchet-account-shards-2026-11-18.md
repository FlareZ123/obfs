# Verified-account SQLite shard experiment: cross-principal contention and replay fidelity

**Agent 41. 18 November 2026. Intermediate, source-pinned operational evidence.**

## Question and preregistration

Does placing independent, server-verified SCO principals in separate local SQLite WAL database files prevent an A-only writer transaction from blocking unrelated B, while preserving the original public facade, private 8 MiB/event HMAC and cross-process replay semantics? Protocol and kill conditions were registered in [the preregistration](../workplace/sco-ratchet-account-shards-preregister-2026-11-18.md) before implementation.

SQLite's [official WAL documentation](https://www.sqlite.org/wal.html) states that one WAL database has only one writer at a time. [SQLite transaction isolation](https://www.sqlite.org/isolation.html) independently establishes the single-writer restriction. The experiment tests a **storage-topology change**, not an additional obfuscation or hostile-client barrier.

## Exact executable and validation

- Simulators: [two-process differential](../sims/sco-ratchet-account-shards.js), [trusted HTTP test process](../sims/sco-ratchet-transactional-http-child.js), shared [launch harness](../sims/sco-ratchet-transactional-http.js), original [SQLite state engine](../sims/sco-ratchet-transactional-store.js) and original [8 MiB/event HMAC](../sims/sco-ratchet-boundary.js).
- Source pin **`191281dcce77ede6e0154dd095f7d7299eb41efa`**, successful manually dispatched [Linux/Windows Node 22, strict implementation and external JSDoc run 44275618416](https://github.com/FlareZ123/obfs/actions/runs/44275618416). `node sims/sco-ratchet-account-shards.js` is the direct reproduction step. No external API/LLM inference was used to evaluate outputs.
- Both arms used independently started trusted Node processes and exactly the generated `batch.mjs` RPC source: **539 bytes, SHA-256 `44f39484cf0d5c52b38343d702e57050e88baa7eef7df61df715b103c242f326`**. Cookie verification, selected method, root, HMAC and sequence algorithm were unchanged.
- The control uses one SQLite file and a single isolation key. The candidate uses a SHA-256-derived pathname for each of **two explicit verified principals** and a matching in-process isolation key. Both had preinitialized WAL databases, preventing the independently known simultaneous cold-start race from contaminating writer-lock results.

## Actual measurements

A trusted test-only endpoint held A's `BEGIN IMMEDIATE` transaction open for 1,500 ms. A different trusted Node HTTP process handled B's two-event fresh batch; each sampled B output matched the original HMAC. The table preserves **all three** raw pairs per arm and OS, in milliseconds; the rightmost value is end-to-end HTTP wall latency divided by a separate direct-original two-HMAC computation.

| OS | Storage | B wall samples (ms) | Direct-original samples (ms) | Strict wall ratios |
| --- | --- | --- | --- | --- |
| Ubuntu Node v22.23.4 | One global file | 1567.864, 1542.833, 1542.427 | 8.662, 8.310, 8.140 | 181.00943, 185.67021, 189.49684 |
| Ubuntu Node v22.23.4 | A/B shards | 12.857, 10.529, 10.810 | 8.062, 8.068, 8.168 | 1.59481, 1.30501, 1.32335 |
| Windows Node v22.23.4 | One global file | 1596.383, 1558.356, 1549.355 | 15.660, 13.681, 14.196 | 101.94019, 113.90239, 109.13947 |
| Windows Node v22.23.4 | A/B shards | 37.268, 19.131, 27.957 | 12.965, 14.793, 14.268 | **2.87456**, 1.29323, 1.95939 |

The median shared-file/sharded B latency ratios were **142.72276× Ubuntu** and **55.74117× Windows** in this deliberately held-writer scenario. There were **3/3 strict >2.5× wall/direct-native latency pairs** per OS for the shared file, **0/3 Ubuntu** and **1/3 Windows** for shards. Because the budget concerns **compute time**, not queueing-inclusive HTTP latency, those wall observations alone cannot classify computational compliance. The Windows candidate still has an observed over-2.5× *latency* outlier, which must be preserved.

## Behavior and adversarial controls

Both platforms/arms returned HTTP **200/200** for two identical simultaneous A seq0 requests while committing only two A events. Distinct A seq2 payloads returned **200/403**, committing only the selected two additional events. Exact latest cross-process retries and later process-restart retries returned **200** without changing A's committed sequence of four. Modified same-sequence and ancient retries returned **403**; a client-supplied B override in the A request was denied. Independent B completed six events and preserved its last cached output across a fresh process; the unauthenticated RPC was 403. Both arms compared every accepted output with native original HMAC results.

## Decision and limits

**Supported:** A single held writer in an A-specific SQLite WAL file did not block independently authenticated B's SQLite writer on another local two-process server. In contrast, the monolithic file blocked B for the A hold duration. Same-account transaction ordering and one-entry result caching remained correct in the tested races and graceful restart. This is a bounded improvement in *service isolation* for the chosen storage architecture.

**Unsupported:** No static reconstruction, runtime extraction, hostile-instrumentation, domain-lock or unauthorized-modification advantage was demonstrated over equal-trust ordinary authenticated HTTP. An authorized A can still relay their own computations, and the sharded implementation can still be attacked via many legitimately authorized principals consuming files, memory, storage, HMAC CPU or server capacity. The experiment uses only two hard-coded verified principals. SQLite-on-disk path/symlink permissions, multi-host consensus, cold concurrent initialization, actual crash/power loss, mixed-principal atomic operations, browser/WAN/TLS costs, process-wide CPU and the universal 2.5× objective were not established. The same mechanism is available to a conventional server.

The initial [run 44275473838](https://github.com/FlareZ123/obfs/actions/runs/44275473838) failed **external JSDoc only**, because the trusted configuration's type narrowing was lost across a local helper closure. It executed no differential. The targeted variable capture fix in `191281dc` gave the complete two-OS green result above. This report belongs in intermediate evidence and does **not** change the [release-blocked research decision](../results/README.md).
