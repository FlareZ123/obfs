# Server-resident private per-principal workers mitigate measured authenticated SCO B starvation

**Agent 7, 18 November 2026 UTC. Status:** *intermediate positive engineering/capacity experiment*, not an established anti-deobfuscation result or universal 2.5× guarantee. This adds genuine worker-isolated private original execution to the existing authenticated `createScoHandler` service under the same independent A/B attacker.

## Source and reproducibility

The [two-OS targeted Node 22 CI run 44244234084](https://github.com/FlareZ123/obfs/actions/runs/44244234084) passed at exact source **`e853e4c559d47dd3790ffcc449274b3920084414`**, with strict main and external JSDoc, Ubuntu job `134599174639`, Windows `134599174279`. Script: `node sims/sco-ratchet-worker-http-contention.js`; root/private worker implementation: `sims/sco-ratchet-tenant-worker.js`; independent real B process: `sims/sco-ratchet-cross-account-worker.js`. Targeted workflow: `.github/workflows/manual-sco-ratchet-worker-http.yml`. All raw samples are emitted with `SCO_WORKER_HTTP_CONTENTION` in source-pinned CI logs. The first CI `44244095318` failed in strict external JSDoc before any workload; precise result typing/backend narrowing was fixed in the cited green source.

## Specific threat and test architecture

The attacker controls its own legitimately authorized Account A and sends **one legal 64-event** batch, each event performing **8,388,608 bytes of the original keyed HMAC workload**. A distinct verified Account B performs a legal **16-event** batch in a separate Node process. A's private work-start/end timestamps are sampled inside the trusted private executor. A worker executes a one-shot same-directory atomic signal write at entry; an independent B child watches that signal and submits its actual HTTP POST during A's work. The test checks B's monotonic request timestamp is strictly between A's real private start/end timestamps, and verifies exact A/B/quiet outputs against independent original native machines with distinct principals and 200 HTTP status. Both arms use localhost Node 22, the same generated RPC facade, `createScoHandler`, per-principal keyed isolation, randomized verified cookies and original machine implementation.

The **synchronous** arm runs A's private HMAC on Node's main event loop, keeping B HTTP pending until A returns. The **worker** arm uses prestarted Node `worker_threads` dedicated to each verified principal and retains each private machine/root in the trusted server. The handler still enforces input shape, expected state progression and authenticated session identity. A runs in its own worker and B in a separate B worker; the HTTP event loop remains able to dispatch B while A runs. Startup is excluded only because the prompt allows amortizing trusted SCO *server initialization*; dispatch, message transfers, HMAC execution and B HTTP time are included in measured B latency. Each trial releases its workers and retains no client-accessible root/source. This is a research prototype, not an integrated supported production server option.

There are **seven trials in each arm on each platform**, each with a direct in-process 16-event native B measurement, independent cold quiet B HTTP control, independent cold A-overlapped B HTTP and A private-work overlap witness. Both arms' HMAC algorithm and event counts are identical. All original private outputs and status codes match. Arms execute sequentially with independently sampled roots, so numerical cross-arm ratios can be affected by machine load/order; all strict decisions are explicitly scoped to the pinned samples.

## Pinned measurements

| Metric | Ubuntu | Windows |
| --- | ---: | ---: |
| Synchronous B/direct-original loaded median | 5.08501× | 5.09915× |
| Resident-worker B/direct-original loaded median | 1.47473× | 1.62408× |
| Resident-worker B/matched quiet child median | 1.39187× | 1.48152× |
| Synchronous loaded B/original strict >2.5× | 7/7 | 7/7 |
| Resident-worker loaded B/original strict >2.5× | 0/7 | 0/7 |
| **Resident-worker loaded B / synchronous SCO loaded B median** | **0.29597×** | **0.32867×** |
| Independent B submitted during A HMAC, both arms | 7/7 + 7/7 | 7/7 + 7/7 |
| Original cryptographic output parity, authenticated HTTP 200 | All checked | All checked |

| Trial | Ubuntu worker/direct-original | Windows worker/direct-original |
| ---: | ---: | ---: |
| 1 | 1.47473× | 1.76259× |
| 2 | 1.51408× | 1.52151× |
| 3 | 1.50363× | 1.67826× |
| 4 | 1.44143× | 1.62408× |
| 5 | 1.40091× | 1.77592× |
| 6 | 1.46301× | 1.54849× |
| 7 | 1.48368× | 1.52971× |

**Observed test-window improvement:** the previously measured ~5× loaded B/direct-original latency for the synchronous service fell to approximately **1.47× Ubuntu / 1.62× Windows** with resident authenticated per-principal workers under this single-A-burst model. Across both platforms, the worker variant had **0/14 strict loaded-B/direct-original >2.5×** sampled breaches compared with **14/14 synchronous** breaches. This is a meaningful capacity/fairness change in the same generated SCO transport. It provides no extra static-code secrecy, domain lock, anti-relay property, or unforgeable authorization beyond the existing trusted server.

## Boundaries and next falsification

The budget in the primary objective is **compute**. These measurements are *end-to-end service latency*, including independent cold B HTTP. They do not directly sum CPU across the trusted parent, worker threads, client, and 64-event adversarial A. No universal compute-efficiency statement follows. The worker startup exemption is applicable only if workers are truly initialized server-side before timed repeated work.

The experiment has one A principal and one overlapping legal burst per trial. It does **not** test a sustained stream of valid A calls, many adversarial verified principals (Sybil-style worker saturation), memory quotas, crash recovery, worker lifecycle under exceptional requests, internet TLS, real browser startup, worst-case Node scheduling, or source publication deployment. An unlimited principal-creation attacker could exhaust a one-worker-per-account system unless admission controls bound it. Worker-to-worker message validation and loss-of-response transactional state require independent production review. State transition and source/authorization parity is tested only for the stated positive workload.

**Next release gating:** run alternating same-root A/B crossover pairs (to rule out order drift); measure A's own 64-event budget and both process CPU costs; add repeated A bursts and multiple verified A principals under a bounded worker pool, plus stale/replayed/unauthorized requests. Compare against an **equally trusted conventional worker-pooled server**, since worker fairness is deployment architecture, not intrinsically added obfuscation security. Retain short-RPC native/protected overhead and online relaying as distinct release vetoes.
