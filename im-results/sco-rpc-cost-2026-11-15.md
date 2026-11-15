# SCO remote method granularity and the 2.5× latency budget

Date: 2026-11-15. Evidence status: **intermediate computational measurement**, one GitHub Actions Linux runner, no independent replication. Reproduction source: [`sims/sco-rpc-cost.js`](../sims/sco-rpc-cost.js), invoked through the dispatch-only [`manual-sco-rpc-cost.yml`](../.github/workflows/manual-sco-rpc-cost.yml). [Successful run and full log](https://github.com/FlareZ123/obfs/actions/runs/43680032926); [raw seven-round timings artifact](https://github.com/FlareZ123/obfs/actions/runs/43680032926/artifacts/14147138879).

## Question and method

The SCO architecture has a genuine trust boundary when selected computation remains on the server behind `authorizeRpc`, but remote calls impose transport latency. How coarse must a protected operation be before its measured end-to-end execution remains below the requested **2.5×** slowdown?

The measurement used Node.js **22.23.4** on Ubuntu GitHub Actions. The same process hosted an HTTP `createScoHandler` with `remoteMethods.compute` and `authorizeRpc:()=>true`. The client issued sequential JSON POST requests via Node's `fetch` to loopback `127.0.0.1` and parsed JSON responses. The baseline called the identical deterministic `Math.imul` integer-hash function directly. Each round executed 12 calls on the same sequence of inputs. Seven measured rounds alternated local-first and RPC-first, after six paired warmups; the median duration of each seven-round group was compared. All returned values were checked for exact equivalence. HTTP listener initialization was excluded.

This is deliberately favorable to RPC: no cross-machine round trip, no TLS or external auth/session store, no packet loss, and no adversarial concurrency. The ratios compare observed wall-clock durations including RPC overhead. They are not a universal guarantee or a pure CPU-instruction ratio.

## Observed values

| Integer-hash iterations per call | Local median, 12 calls | SCO RPC median, 12 calls | RPC / local | Within 2.5× |
|---:|---:|---:|---:|:---:|
| 32 | 0.002 ms | 11.664 ms | 7,099.11× | No |
| 4,096 | 0.062 ms | 10.443 ms | 169.05× | No |
| 65,536 | 0.988 ms | 9.391 ms | 9.51× | No |
| 524,288 | 7.846 ms | 16.520 ms | 2.11× | Yes |
| 2,097,152 | 31.340 ms | 39.440 ms | 1.26× | Yes |

**Interpretation:** Fine-grained RPC exceeds the 2.5× budget by orders of magnitude in this setup, even with a warm local server. Workloads with roughly 8–31 ms of original CPU work per 12-call batch crossed below the threshold on this one machine. These figures do not establish a universal cutover size: CPU frequency, workload, network, serialization size, TLS, caching, auth checks, parallelism, and browser scheduler behavior change the threshold.

The implementation should expose high-value **coarse** server-owned operations when their confidentiality or authorization matters. Small client hot-path computations should usually remain local if the 2.5× bound is mandatory. Explicit batching is a research hypothesis worth evaluating; it could amortize HTTP connection and request overhead but would need independent semantic and security analysis.

## Relationship to threat model

SCO can withhold server-resident implementation and secrets from static extraction of delivered client files. This measurement says nothing about cryptographic resistance, dynamic instrumentation, black-box oracle attacks, or production authorization policy. Authorized adversaries in the prompt can submit unlimited legitimate requests and observe all results. `authorizeRpc:()=>true` is only an experimental control, **never an acceptable production authorization policy for privileged methods**.

Re-run this experiment across more CPUs, real browsers, remote network links, authenticated sessions, and batched and concurrent execution profiles before adopting a performance policy. The per-run raw timings are preserved in the workflow artifact, and the source script generates its own `rpc-cost-output.json` with system metadata.
