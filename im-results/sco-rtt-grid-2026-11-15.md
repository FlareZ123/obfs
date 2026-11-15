# Server-controlled obfuscation: network-like delay, concurrency, and batching grid

2026-11-15. Classification: **intermediate measured evidence**, one GitHub Actions Ubuntu runner with Node 22, not independently replicated. Implementation: [sims/sco-rtt-grid.js](../sims/sco-rtt-grid.js), manual-only [.github/workflows/manual-sco-rpc-cost.yml](../.github/workflows/manual-sco-rpc-cost.yml). [Successful workflow 43681537052](https://github.com/FlareZ123/obfs/actions/runs/43681537052); [raw output artifact 14148865485](https://github.com/FlareZ123/obfs/actions/runs/43681537052/artifacts/14148865485).

## Measurement design

Each measurement evaluates 12 independent deterministic Math.imul hash calls of equal size, after warmup. The same Node process hosts an HTTP createScoHandler and a Node fetch client on loopback 127.0.0.1. Four strategies were compared with identical results checked byte-for-byte through deep equality:

- Direct local CPU loops, sequential.
- Twelve separate sequential JSON HTTP RPC requests.
- Twelve separate JSON HTTP RPC requests issued concurrently using Promise.all, with the handler's async authorization waits overlapping. This strategy only preserves semantics for independent operations.
- One JSON HTTP RPC request containing an explicit createScoBatchMethod batch of twelve operations, executed sequentially on the server.

The experiment adds an **injected authorization wait of 0, 5, 25, or 100 ms per HTTP request**. This is a controllable proxy for an application/network fixed wait, **not an actual measured network RTT**. There is no real cross-machine networking, TLS, authorization database, packet loss, or CSRF defense; production latencies may differ materially. Each point uses five measured rounds with rotating strategy order. Per-request latency observations, raw per-strategy round durations, exact encoded request/response byte totals, runner CPU metadata, and config are saved in the artifact.

## Observed slowdown ratios, relative to equal local CPU computation

| Artificial wait per HTTP request | Work per operation (hash iterations) | Separate sequential RPCs | Separate concurrent RPCs | One sequential 12-operation batch |
|---:|---:|---:|---:|---:|
| 0 ms | 4,096 | 168.66× | 96.70× | 17.16× |
| 0 ms | 65,536 | 10.11× | 6.26× | **1.75×** |
| 0 ms | 524,288 | **2.06×** | **1.50×** | **1.09×** |
| 5 ms | 4,096 | 1,243.14× | 146.04× | 105.96× |
| 5 ms | 65,536 | 76.39× | 9.91× | 7.34× |
| 5 ms | 524,288 | 10.61× | **2.06×** | **1.81×** |
| 25 ms | 4,096 | 5,570.51× | 509.09× | 468.88× |
| 25 ms | 65,536 | 349.20× | 32.40× | 30.28× |
| 25 ms | 524,288 | 44.70× | 4.96× | 4.66× |
| 100 ms | 4,096 | 21,721.50× | 1,865.86× | 1,815.41× |
| 100 ms | 65,536 | 1,366.02× | 117.65× | 114.11× |
| 100 ms | 524,288 | 172.83× | 15.68× | 15.34× |

Bold results met the requested 2.5× runtime bound **on this single runner for these exact workloads**.

## Interpretation

The unchanged server-only implementation can be concealed from static client inspection through SCO, but the network/authorization dependency creates a hard performance constraint. Batching reduces independent request overhead substantially. Parallel requests can reduce wall-clock time for independent operations, while offering no equivalent execution-order guarantee for stateful methods. Neither approach helps enough when the fixed delay dominates the original computation. With 25 ms simulated wait, even the largest tested 524,288-iteration calls exceeded 2.5× under both parallel requests and one batch. With 100 ms simulated wait, all twelve workload/delay combinations in that row family failed the budget.

For any system where one round trip adds a non-overlappable wait d and the same work costs t locally, the best possible end-to-end ratio cannot be below 1 + d/t, before serialization and server costs. A 2.5× limit therefore requires the fixed per-use delay to be small relative to the protected work. Even server-controlled initial setup cannot amortize repeated network waits away under the prompt's time-budget definition.

Batched operations expose a more efficient black-box oracle to authorized adversaries, too. The maxCalls bound limits one request's operation count but does not limit the total number of valid requests; that requires an independent server-side usage and authorization policy. The experiment intentionally sets authorizeRpc to allow access and should never be copied into a privileged production server.

## Open work

Repeat across actual browser-to-server networks with TLS, authentication, nontrivial response sizes, high concurrency, multi-client contention, typed payloads, and more representative protected algorithms. Measure server CPU and memory consumption separately from client elapsed time. Benchmark approved operation frequencies, since moving a hot, tiny function across a trust boundary is incompatible with a strict 2.5× wall-time limit under ordinary network RTT.
