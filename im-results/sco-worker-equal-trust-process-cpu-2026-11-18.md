# Equal-trust original-HMAC process CPU: generated SCO worker versus ordinary Node worker (18 November 2026)

**Status:** replicated intermediate CPU and semantic-parity evidence, not strong-obfuscation security. Both Linux/Windows Node 22 and dual JSDoc jobs in [completed CI run 44254031271](https://github.com/FlareZ123/obfs/actions/runs/44254031271) passed at exact immutable source **\`98619425ff6117a3df167de7180504ec4c4ce94c\`**. The experiment was preregistered in [workplace/sco-worker-equal-trust-process-cpu-preregister-2026-11-18.md](../workplace/sco-worker-equal-trust-process-cpu-preregister-2026-11-18.md) before the successful run was inspected.

## Why this control matters

The preceding independent-child [real-HTTP cross-account worker fairness experiment](sco-worker-equal-trust-transport-2026-11-18.md) found that generated SCO and a conventional authenticated Node server with the same original secret and private workers had almost indistinguishable Account B loaded response latency. That comparison did **not** directly evaluate total CPU or the specification's 2.5× compute ceiling.

Here [\`sims/sco-ratchet-worker-process-cpu.js\`](../sims/sco-ratchet-worker-process-cpu.js) extends the preexisting direct-original and generated synchronous/worker CPU benchmark with a **third ordinary authenticated Node worker**. Each of seven root-matched trials uses a new identical 32-byte original private root across its three separately initialized servers, exactly **80 genuine original HMAC events** per arm (64A+16B; 8,388,608 bytes/event), the same stateful principals, cookie/JSON arguments and registered original private HMAC. Three-arm execution order rotates all six permutations plus one repeat. Exact native outputs, HTTP 200 and 80 executed events are asserted.

For each arm, the harness measures native 80-event original machine CPU and the 80-event real HTTP/fetch/worker response path using Node's **process-wide user plus system CPU** (worker threads included), sampled after resident worker initialization. The runner returns protected/original CPU ratio, the paired generated-worker / ordinary-worker normalized CPU ratio and raw process CPU microseconds. A strict observed ratio over 2.5× is a workload veto; no median-based exception is applied.

## Outcome from source-pinned CI

| 80-event original versus protected CPU | Ubuntu Node 22 | Windows Node 22 |
| --- | ---: | ---: |
| Three-way same-root trials | 7 | 7 |
| Generated SCO synchronous median protected/native | **1.01230×** | **1.00000×** |
| Generated SCO resident-worker median protected/native | **0.97677×** | **1.07371×** |
| Ordinary authenticated resident-worker median protected/native | **0.97633×** | **1.06849×** |
| Generated worker / ordinary worker *paired normalized* median | **1.00521×** | **1.03890×** |
| Generated worker / ordinary worker *raw protected CPU* median | **1.00119×** | **1.03761×** |
| Highest generated worker / ordinary worker paired normalized CPU ratio | 1.15234× | 1.14725× |
| Generated synchronous strict >2.5× | 0/7 | 0/7 |
| Generated worker strict >2.5× | **0/7** | **0/7** |
| Ordinary worker strict >2.5× | **0/7** | **0/7** |
| Native output parity, successful HTTP and 80 genuine private events | 7/7 each | 7/7 each |

Raw generated-worker/ordinary-worker **paired normalized** CPU ratios, in trial order, from the immutable CI marker \`SCO_WORKER_PROCESS_CPU\`:

| Trial | Ubuntu | Windows |
| ---: | ---: | ---: |
| 1 | 1.15234× | 1.14725× |
| 2 | 0.93643× | 0.97138× |
| 3 | 1.02172× | 1.07585× |
| 4 | 1.00521× | 1.00023× |
| 5 | 0.98503× | 1.03890× |
| 6 | 1.08170× | 1.07078× |
| 7 | 0.99632× | 1.00229× |

Each raw CI record additionally contains the original/protected user/system microseconds and all seven per-arm protected/native ratios. Ubuntu generated-worker absolute protected CPU ranged from 432,028 to 493,409 microseconds for its 80 events; ordinary-worker from 432,612 to 461,102. Windows generated-worker CPU ranged from 437,000 to 500,000 microseconds and ordinary from 437,000 to 468,000. Windows CPU reads show coarse millisecond-level quantization and should not be interpreted as precise sub-percent improvements.

## Interpretation and bounded decision

These CPU samples show **no material incremental worker compute advantage from generated SCO transport** over a conventional authenticated HTTP service holding the same secret and running the same original private HMAC in identical server-resident workers. On this sustained 80-event workload, both worker arms and the synchronous generated arm yielded exact native semantics and zero sampled strict protected/original >2.5× breaches on each OS. This is a scoped feasibility result and a useful equal-trust control; it does not establish source-reconstruction resistance, authorization superiority, dynamic-analysis resistance or a new obfuscation security candidate.

**Exclusions:** The benchmark includes Node server-side process CPU and same-process local client fetch/serialization. It does not separately sum *independent* client CPU, execute the published browser ESM facade, exercise TLS/WAN, include worker startup, measure isolated selected hot arithmetic, or establish browser lifecycle performance. The earlier independent-child latency test supplies genuine B-during-A private-work proof for its *different* two-arm samples; this CPU test has concurrent HTTP A/B but does not assert that B submitted during A's worker interval. No assertion of universal strict budget, low-percent performance superiority or cross-account fairness follows. The measured [eight-A-principal starvation counterexample](sco-ratchet-worker-multi-principal-2026-11-18.md) remains separate and negative.

**Conclusion:** Keep resident worker isolation as a promising conventional server scheduling pattern with specified admission costs. Obfuscation claims require an independent, equal-trust attack advantage and the complete intended client/server 2.5× workload budget. The primary release remains **BLOCKED**.
