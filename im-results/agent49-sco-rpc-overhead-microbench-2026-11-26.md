# Agent 49: RPC granularity versus the 2.5x runtime budget

**Date:** 2026-11-26  
**Reproducible harness:** `sims/agent49-sco-rpc-overhead-microbench.js` on `main`  
**Local runtime:** Node v22.16.0, Linux x64, AMD EPYC 9V74 80-Core Processor.

## Experiment

A synthetic four-state, two-symbol Mealy transition function was executed locally and through a same-process loopback HTTP server using Node's native `fetch`. The server and client share one process; the endpoint uses no TLS, cookies, authentication, or production SCO code. This is therefore a local lower-bound transport experiment, not a production measurement.

- Local step: 3 warmups of 2 million transitions, then 7 trials of 10 million transitions.
- Single-step HTTP: 5 trials of 1,000 sequential fetch/JSON roundtrips.
- Batched HTTP: 5 requests each for batch sizes 10, 100, and 1,000; each batch executes the same stateful transitions on the server.
- The benchmark script is committed so future agents can reproduce it on the hosted runner and compare environments.

## Measurements

| Execution mode | Mean latency per operation | Ratio to local step |
|---|---:|---:|
| Local JS table transition | 4.506 ns | 1× |
| One HTTP request per transition | 408.759 µs | 90,720× |
| Batch of 10 | 29.620 µs per transition | 6,574× |
| Batch of 100 | 2.870 µs per transition | 637× |
| Batch of 1,000 | 358.801 ns per transition | 79.6× |

Single-step HTTP latency across 5,000 requests:
- mean: 0.4088 ms
- p50: 0.3347 ms
- p95: 0.7894 ms
- maximum: 8.1136 ms

Local step across seven trials:
- median: 4.5057 ns
- minimum: 4.4782 ns
- maximum: 4.5870 ns

Batched request mean latencies:
- 10 operations: 0.2962 ms/request
- 100 operations: 0.2870 ms/request
- 1,000 operations: 0.3588 ms/request

## Consequence for the 2.5x budget

If the budget is elapsed execution time and a function makes (k) sequential remote calls with mean roundtrip latency (L), then even ignoring server computation and serialization:

[
T_{mathrm{obfuscated}} geq T_{mathrm{original}} + kL
]

The 2.5x constraint therefore requires:

[
kL leq 1.5T_{mathrm{original}}
]

For the measured single-call mean (L=0.4088) ms, the original computation per call must take at least (L/1.5=0.2725) ms to remain within 2.5x. At p95 latency, the corresponding threshold is 0.5263 ms.

For the four-state table transition itself (4.51 ns), a single HTTP call is about 90,720 times the local operation. Even a 1,000-operation batch remains about 79.6 times the local step; its per-step overhead is 0.359 µs, requiring at least 0.239 µs of original computation per step to fit the 2.5x budget.

For a 10-second original workload, the mean single-call latency alone would permit at most about 36,696 sequential calls within the 15-second additional-time allowance (about 19,001 at p95), before accounting for server computation, TLS, remote-network latency, or tail-risk.

## Design implication

Per-primitive-operation remote RPC is incompatible with the 2.5x budget for cheap operations. SCO should use remote calls at coarse semantic boundaries, batch independent or predetermined work where possible, or perform initialization remotely and then execute the hot path locally. Batching helps substantially but cannot remove the latency floor when each step depends on the previous response.

This is not a claim that all SCO designs violate the budget. A remote call around a millisecond-scale or longer computation can fit; a single remote call around a 10 ms operation is plausibly below 1.05x at the measured mean. The correct unit of analysis is the actual call granularity and original workload.

## Limitations

The local JS transition is deliberately tiny. The same-process loopback HTTP server is a lower-bound proxy and is not the actual SCO server/client, browser, TLS deployment, or network topology. The measurements do not include the production module's cookie handling, response authentication, or server startup. The hW live benchmark measures attack queries and should not be confused with a production client-runtime benchmark.

Keep this as intermediate performance evidence in `im-results/`; it is not a full 2.5x acceptance result.
