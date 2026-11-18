# Per-principal SCO SQLite cold admission: first-use cost and storage footprint

**Agent 41, 18 November 2026. Intermediate operational evidence.** Source pin `80c5d6bf286a9d0beac71a968bfd763ef54c9676`; [completed successful cross-platform Node 22 and strict JSDoc run 44277583114](https://github.com/FlareZ123/obfs/actions/runs/44277583114), Ubuntu and Windows. The exact independent simulator is [`sims/sco-ratchet-shard-cold-admission.js`](../sims/sco-ratchet-shard-cold-admission.js). The [experiment was preregistered](../workplace/sco-ratchet-shard-cold-admission-preregister-2026-11-18.md) before implementation. This investigates server-side **availability and lifecycle costs**, with no demonstrated obfuscation advantage.

## Protocol

For 1, 8 and 64 separate verified-principal strings and five independently randomized trials per account count, each principal executes one original 8 MiB/event HMAC ratchet operation using the exact same trusted 256-bit root as an independent `createPrivateMachine` native reference. Output parity and one `fresh` event per principal are asserted. Three arms are measured with rotating trial order: **shared** one existing SQLite WAL file holding all principal rows; **warm** one separate already-created and open SQLite WAL file per principal; **cold** one truly nonexistent per-principal SQLite file created, journaled, written, and closed inside the timed work. No publicly supplied principal controls file path in the actual HTTP prototype; this cost simulator supplies explicit trusted principal IDs. Warm and shared SQLite initialization is excluded from the measured window; cold creation is included, so the arms represent different lifecycle policies.

Native reference and each arm are measured by monotonic wall time and `process.cpuUsage()`; Windows zero-resolution CPU samples are recorded as null rather than treated as passes. The simulator also counts SQLite database files and file bytes after closing the stores. It is a **local trusted Node workload** without the actual HTTP client/network, browser, account verification, concurrent contention or process failover.

## Summary of all 90 arms

Five trial pairs per row. Ratios are total account-session **wall time** versus the same number of original native one-event HMAC operations. The CPU column is the median of **measurable** positive CPU samples only; `n/5` records how many were meaningful. The breach columns retain **strictly over 2.5×** samples, irrespective of their medians.

| OS | Accounts | Arm | Median wall ratio | Wall >2.5× /5 | Median CPU ratio | Measured CPU pairs | CPU >2.5× |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| Ubuntu | 1 | Shared | 1.10427 | 0 | 1.02301 | 5 | 0 |
| Ubuntu | 1 | Warm | 1.09725 | 0 | 1.00874 | 5 | 0 |
| Ubuntu | 1 | Cold | 3.32591 | 4 | 1.27829 | 5 | 0 |
| Ubuntu | 8 | Shared | 1.13794 | **1** | 1.01788 | 5 | 0 |
| Ubuntu | 8 | Warm | 1.13415 | 0 | 1.01938 | 5 | 0 |
| Ubuntu | 8 | Cold | 2.61508 | 4 | 1.29818 | 5 | 0 |
| Ubuntu | 64 | Shared | 1.17514 | 0 | 1.02029 | 5 | 0 |
| Ubuntu | 64 | Warm | 1.20414 | 0 | 1.01638 | 5 | 0 |
| Ubuntu | 64 | Cold | 2.33206 | **2** | 1.28515 | 5 | 0 |
| Windows | 1 | Shared | 1.93449 | 0 | *inconclusive* | 0 | 0 measured |
| Windows | 1 | Warm | 1.86328 | **1** | *inconclusive* | 0 | 0 measured |
| Windows | 1 | Cold | **10.99743** | **5** | *inconclusive* | 0 | 0 measured |
| Windows | 8 | Shared | 1.80491 | 0 | 1.00000 | 5 | 0 |
| Windows | 8 | Warm | 1.98898 | 0 | 1.00000 | 5 | 0 |
| Windows | 8 | Cold | **11.03884** | **5** | 1.65957 | 5 | **1** |
| Windows | 64 | Shared | 1.78536 | 0 | 1.07346 | 5 | 0 |
| Windows | 64 | Warm | 2.08926 | 0 | 1.11137 | 5 | 0 |
| Windows | 64 | Cold | **11.57963** | **5** | 1.88626 | 5 | 0 |

**Strict event-level caveat:** The eight-principal Windows cold arm trial 3 measured `cpuRatio=3.00000`, `wallRatio=11.06057`, `coldCpuMs=141`, with quantized process CPU clock resolution. This is an observed **>2.5× CPU-compute ratio** under the measured trusted-server request-time storage scenario; a universal budget pass is therefore unsupported. The one-account Windows CPU ratios are absent for all five trials in each arm. Ubuntu shared eight-principal trial 3 measured wall ratio `2.53265×` despite modest CPU ratio `1.03081×`, showing that a wall-only veto need not imply excess compute.

### Disk footprint after closing stores

| Verified principals | Shared database | Separate warm databases | Separate cold databases |
| ---: | ---: | ---: | ---: |
| 1 | 1 file / 16,384 B | 1 / 16,384 B | 1 / 16,384 B |
| 8 | 1 / 16,384 B | 8 / 131,072 B | 8 / 131,072 B |
| 64 | 1 / 32,768 B | 64 / 1,048,576 B | 64 / 1,048,576 B |

These file-size observations include only `.sqlite` data files as counted after clean shutdown, not the temporary WAL/shm files during active use or persistent operational quotas. The 64-shard architecture consumed **32×** the bytes of the single-file control in this sample.

## Raw distinctive observations

The exact run logs contain the complete JSON-serialized 45 trial records, three arms each, including wall and CPU milliseconds, ratios, trial ordering, and three disk footprints. Examples:

- Ubuntu 1-account trial 0: original 4.191 ms wall/4.173 ms CPU; shared 4.577 ms wall/4.269 ms CPU; warm 4.494 ms/4.101 ms; cold **13.939 ms/5.414 ms**.
- Windows 1-account trial 0: original 7.213 ms wall/**0 ms CPU**; shared 14.477 ms wall/16 ms CPU; warm 13.004 ms wall/**0 ms CPU**; cold **84.957 ms wall/31 ms CPU**, all ratios against original CPU **undefined**.
- Ubuntu 64-account trial 0: original 249.529 ms wall/249.491 ms CPU; shared 322.988/261.627; warm 304.991/257.972; cold **660.891/321.799**.
- Windows 64-account trial 0: original 419.860 ms wall/422 ms CPU; shared 749.602/469; warm 935.882/453; cold **4861.822/828**.

## Decision

The previous [A/B SQLite shard isolation improvement](sco-ratchet-account-shards-2026-11-18.md) is conditional on already-initialized, stable trusted storage. Creating separate WAL databases for newly authenticated accounts during protected request execution can cost substantially more wall time and storage, especially on the sampled Windows runner. Warm stores reduce that measured cost and require separately accounting for startup, number of accounts, persistent disk quota, and application lifecycle.

The original prompt allows amortization of initialization in **trusted SCO/SNO server startup**, but does not automatically exempt each new authenticated account's on-demand protected request admission. The CPU samples do **not** prove the 2.5× bound for all account counts: one Windows cold session strictly exceeded it and five one-account Windows samples per arm were unresolved.

No new source secrecy, anti-relay, static/dynamic reconstruction, tamper or environment-lock result follows. A malicious authorized A with unlimited requests may attempt account or resource exhaustion; the current explicit A/B HTTP harness does not test unbounded account creation. Equal-trust ordinary HTTP servers can adopt the same storage topology. Keep this evidence in `im-results/`, and maintain the main [release-blocked decision](../results/README.md).
