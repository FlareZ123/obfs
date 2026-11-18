# Two-level verified-principal SCO quota: local CPU work cost under original HMAC

**Agent 41, 18 November 2026. Intermediate, workload-scoped performance evidence.** [Preregistered experiment](../workplace/sco-ratchet-nested-quota-cpu-preregister-2026-11-18.md). Exact source `8294feb177db4325ec98049e17597d0a4c873ea8`; [Ubuntu/Windows Node22, strict JSDoc source-pinned CI 44281149397](https://github.com/FlareZ123/obfs/actions/runs/44281149397) **completed green on both OSes**. Reproducer: [`sims/sco-ratchet-nested-quota-cpu.js`](../sims/sco-ratchet-nested-quota-cpu.js), using the existing genuine 8 MiB/event [HMAC root machine](../sims/sco-ratchet-boundary.js), [SQLite state engine](../sims/sco-ratchet-transactional-store.js), and [`createScoKeyedIsolation`](../src/rpc-keyed-isolation.js).

## Strictly scoped method

Three separately advanced stateful **same-root** computations: direct `createPrivateMachine(root).advance` per event; one-level bucket-keyed `createScoKeyedIsolation` around `TransactionalRatchet.batch`; and two-level `createScoKeyedIsolation` with an outer verified-principal quota `(16 per principal, 32 total)` and inner bucket writer queue around the same `TransactionalRatchet.batch`. Two SQLite files were preinitialized outside timing. Each arm ran seven paired batches of sizes **1, 16, 64** on one trusted Node process, with schedules rotating order among native/one-level/nested. Every emitted protected output matched independent native work. Both store arms committed precisely **7, 112 and 448 events** for the three independent principal states, 567 events per arm, and reported the expected final sequence snapshots. Tests ran without HTTP, browser, TLS, multi-principal overlap or intentional contention.

The runner measured `performance.now()` wall and `process.cpuUsage()` user+system deltas on the same process for each operation. A sample's strict ratio is transformed measured CPU or wall divided by direct native original HMAC work for the **same batch input and expected output**. Null Windows CPU samples where the clock reported zero are excluded from any CPU claim. Seven sample-level results per cell are retained in the raw CI JSON output.

## Complete 7×3×2-platform summary

| OS | Events/batch | One-level median CPU/native | Nested median CPU/native | Nested median CPU/one-level | One-level wall >2.5× /7 | Nested wall >2.5× /7 | CPU >2.5× (one/nested) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Ubuntu | 1 | 1.04134 | 1.03263 | 0.98756 | **1** | 0 | 0 / 0 |
| Ubuntu | 16 | 1.00400 | 1.00496 | 0.99831 | 0 | 0 | 0 / 0 |
| Ubuntu | 64 | 1.00424 | 1.00115 | 1.00199 | 0 | 0 | 0 / 0 |
| Windows | 1 | *unmeasurable* | 1.06667 (only **1/7** valid pair) | 1.06667 (only **1/7** valid pair) | **6** | **7** | 0/0 measured |
| Windows | 16 | 1.00000 | 1.00000 | 1.01282 | **3** | **2** | 0 / 0 |
| Windows | 64 | 1.00000 | 1.00000 | 1.00000 | 0 | 0 | 0 / 0 |

Each Ubuntu cell has **7/7** positive CPU comparisons. Windows at one event: **0/7** positive native-versus-one-level CPU pairs; **1/7** positive native-versus-nested; the other zero-resolution samples are explicitly **unknown**, regardless of their wall ratios. Windows 16/64 each had 7/7 meaningful CPU pairs. The collected sample-level strict CPU >2.5 counts were zero among the measurable pairs, and zero-instrument-resolution pairs cannot be assumed to pass.

A separate view of median whole-operation **wall** ratios shows why CPU must remain its own axis:

| OS | Events | One-level wall/native | Nested wall/native | Nested wall/one-level |
| --- | ---: | ---: | ---: | ---: |
| Ubuntu | 1 | 1.13745 | 1.10782 | 0.96899 |
| Ubuntu | 16 | 1.01331 | 1.01081 | 0.99780 |
| Ubuntu | 64 | 1.04222 | 1.00945 | 0.98039 |
| Windows | 1 | **3.47277** | **3.91834** | 0.96979 |
| Windows | 16 | 2.21410 | 2.03820 | 0.93940 |
| Windows | 64 | 1.06575 | 1.05241 | 0.95208 |

For example, the Windows first one-event sample had direct-native **6.004ms wall / 16ms process CPU**, one-level **20.851ms / 0ms**, nested **20.672ms / 0ms**. This CPU resolution is too coarse to test whether those specific short-call executions satisfy 2.5×. Another one-event sample had native **4.732ms / 0ms**, one-level **10.379ms / 0ms**, nested **26.159ms / 16ms**. The actual **nested/old wall ratio of that sample was 2.52046**, despite medians near unity. It must remain a visible strict-tail failure of the incremental *wall* comparison.

## Conclusion and remaining gap

**Supported:** For the preinitialized, single-process, single-principal private-HMAC batches actually tested, wrapping the SQLite writer queue inside a verified-principal admission queue did not produce a measured strict **CPU** >2.5× breach when CPU delta was resolvable. The median incremental nested/one-level CPU overhead was near 1× on both OSes for 16 and 64 events. All 567 genuinely computed original events per arm matched exactly; no empty-protection or bypass shortcut was counted. The nested two-level queue is a plausible **correctness repair** for the [cross-account HTTP429 identity bug](sco-ratchet-bucket-quota-identity-2026-11-18.md), but it is not automatically a low-latency server.

**Unsupported:** These sampled results cannot certify one-event Windows CPU timing, a universal 2.5× bound, end-to-end response latency, host/browsing compatibility, account authorization, full asynchronous workload scheduling, multi-account fairness, actual TLS/WAN or any static/dynamic obfuscation resistance. Earlier tests already demonstrate [same-process CPU blocking](sco-ratchet-shards-eventloop-2026-11-18.md), [same-bucket writer contention](sco-ratchet-bucket-shards-2026-11-18.md) and [authorized A online relaying](../workplace/whitebox-execution-boundary-2026-11-18.md). An equal-trust conventional server can use the same queue architecture. This remains intermediate deployment evidence; the [primary research release is blocked](../results/README.md).
