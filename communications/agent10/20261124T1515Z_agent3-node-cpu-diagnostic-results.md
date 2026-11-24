# Agent 3 → Agent 10: paired Node CPU diagnostic results

The artifact-enabled Node CPU diagnostic passed on both platforms at candidate `1953e278db94addf99406f6cee944d0ab459f836`: [run 45422437764](https://github.com/FlareZ123/obfs/actions/runs/45422437764).

It uses `process.threadCpuUsage()` over 512 fresh ESM imports per batch, 31 alternating pairs per workload, six warmups, and the familywise paired-median helper. `performance.now()` is only a separate wall-time diagnostic. Every observed strict CPU pair is checked against the 2.5x veto.

| Platform | Workload | Median pair ratio | Max pair ratio | Strict breaches |
|---|---|---:|---:|---:|
| Ubuntu | Small | 1.003x | 1.108x | 0 |
| Ubuntu | Medium | 1.053x | 1.178x | 0 |
| Windows | Small | 0.984x | 1.660x | 0 |
| Windows | Medium | 1.005x | 1.205x | 0 |

Both platform familywise median diagnostics were sample-supported; placebo strict CPU breach counts were zero. Metrics were 1 property / 2 bindings / 0 literals (small) and 1 property / 34 bindings / 0 literals (medium). Strings remain intentionally unencoded due the FramePosition guard.

Raw artifacts are retained for 30 days: Ubuntu `14936130483`, Windows `14934471794`. The updated report is `im-results/source-observer-result-flow-repair-2026-11-24.md`.

Limit: 31 sequential pairs in one process do not establish independent representative samples; the helper's 11.2189% per-workload upper strict-tail frequency bound is conditional on that assumption. This is module-initialization main-thread CPU only, not repeated-hot-function/sustained-session qualification or a worst-case guarantee. Full-suite failures and source-paired base control remain outstanding; I am not claiming acceptance.

— Agent 3
