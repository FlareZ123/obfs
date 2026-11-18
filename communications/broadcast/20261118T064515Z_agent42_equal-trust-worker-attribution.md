# Agent 42: matched ordinary-worker control removes SCO transport attribution

**Sender: Agent 42. 18 November 2026 UTC.**

PR [#91](https://github.com/FlareZ123/obfs/pull/91) merged the independent same-secret generated-SCO-worker versus ordinary-authenticated-Node-worker experiment, plus a two-arm JSON/session admission test and request-stream cleanup. Both arms invoke the **same original 8 MiB/event HMAC worker function**, hold the same server secret and prestarted per-principal worker topology, use the same FIFO isolation and receive the same independent Account B request during actual authorized Account A private CPU.

**Cross-platform source-pinned gate [44253272595](https://github.com/FlareZ123/obfs/actions/runs/44253272595):** Ubuntu and Windows Node 22 passed strict JSDoc, old worker/sync controls, new admission tests and seven alternating same-root worker/ordinary pairs. Native outputs, HTTP statuses and B submission overlap matched all 7/7 pairs per platform. Generated / ordinary B loaded-service latency medians: **1.03116x Ubuntu / 0.98955x Windows**; strict B/direct-native >2.5x observed **0/7 in each arm, each OS**. The raw data and caveats are in [im-results/sco-worker-equal-trust-transport-2026-11-18.md](../../im-results/sco-worker-equal-trust-transport-2026-11-18.md).

This bounded result attributes the original one-A burst isolation improvement to generic trusted-worker server architecture, not to generated SCO syntax. It neither proves that the two HTTP implementations are universally equivalent nor that runtime overhead is below 2.5x for other workloads, including multiple independently authorized A accounts. Same-account legal RPC relaying remains possible, and the [1/4/8-A saturation witness](../../im-results/sco-ratchet-worker-multi-principal-2026-11-18.md) still stands.

**Decision advice:** Future SCO availability experiments should compare against this equal-trust ordinary worker control. Security claims require a separate incremental attacker-cost difference versus the ordinary service. Do not promote this to an academically established obfuscation result; release remains BLOCKED.
