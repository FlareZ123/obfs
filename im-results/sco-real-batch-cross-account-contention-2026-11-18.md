# Same-event-loop SCO compiler-generated batch: authorized cross-account queue-fairness challenge (18 November 2026)

**Evidence class:** reproducible separate-client-process, real HTTP availability counterexample under a declared single Node event-loop service. The primary strong-obfuscator remains **RELEASE-BLOCKED**. This is a workload- and deployment-specific queue-fairness measurement, not a general distributed-service denial-of-service theorem.

## Provenance and exact runnable source

The successful [two-platform real SCO batch account-contention workflow 44237772238](https://github.com/FlareZ123/obfs/actions/runs/44237772238) is pinned to exact main source **`7dc69ed87168b5a8b264ee165d376f0085cffa1d`**, with Node v22.23.4 Ubuntu and Windows. Both strict external JSDoc jobs and complete original-value/HTTP-policy/monotonic-overlap checks passed.

Reproduce with `node sims/sco-batch-cross-account-contention.js`. It forks the independent legitimate victim from `sims/sco-batch-contention-worker.cjs`. The opt-in workflow `.github/workflows/manual-sco-batch-account-contention.yml` performs each OS run and retains full structured timing samples in artifacts `sco-batch-contention-Linux` and `sco-batch-contention-Windows`, with recorded installed dependency versions.

This same project had prior unrelated queue-fairness vetoes for stateful ratchet batches, documented in `im-results/sco-ratchet-cross-account-contention-2026-11-18.md`. The present test independently challenges the **actual `partitionScoAsyncModule({batch:true,maxBatchCalls:1024,serverOnlyInitialization:true})` private ESM graph**, keeping the same original application, authentic `createScoHandler` transport, and experimental server-side per-request work cap as the source-pinned resident batch profiler.

## Authenticated private workload and truly independent victim

The compiler runs over `examples/application-challenge/sco-before/api.mjs`, with the original five private ESM modules audited via `build()`. The trusted server binds the real original `evaluateRemote`, instrumenting its entry/exit timestamps without replacing its computation. The server serves only the generated public batch-enabled ESM through the actual HTTP handler, and rejects unauthenticated source reads with 403.

The server recognizes **two independently generated 24-byte bearer credentials** for Account A and Account B. Both can make legitimate requests through precisely the same authorization policy, per-call argument checks, maximum 1,024 nested calls and per-request aggregate limit of 1,024,000 original engine iterations. The two accounts have separate client processes and no shared credential.

The attacker A submits **eight concurrently outstanding, individually valid** batches of 1,024 `evaluateRemote(A_SEED,1000)` operations, totaling **8,192 original engine invocations** and 8,192,000 private iterations across eight **individually capped** HTTP requests. This is allowed under the prompt's assumption of unlimited authorized server requests. It does not attempt one over-cap malicious request.

The legitimate B requests only **one** `evaluateRemote(B_SEED,1)` as a one-item batch. It runs in a **separate Node child process**, prewarming the same authenticated public-ESM download and Node HTTP fetch connection in both the idle and contended variants. The timer begins inside that same child just before its HTTP POST, preventing cold client startup from swamping the queue signal. The parent starts an idle B session and then a contended B session under identical B work and bearer.

On A's first real private operation, the trusted parent records a monotonic timestamp and atomically publishes a one-shot signal file; the waiting B child independently observes it and submits its valid POST. A's original function is instrumented to timestamp the completion of the **8,192nd A invocation**. Each trial asserts that B's independent `process.hrtime.bigint()` submission timestamp falls **strictly after A's first and strictly before A's last private operation**. All A inner responses and B original JSON-wire outputs must pass native comparisons, and every B HTTP response must be 200.

The A burst is deliberately a legal repeated-request load. The aggregate cap applies to each of the eight requests; it does not impose a per-principal total-resource limit or guarantee fair time slices.

## Source-pinned results

Nine complete matched quiet/contended B trials per platform passed strict overlap and output checks:

| OS | Quiet B median HTTP latency | Under-A B median HTTP latency | Median paired loaded/quiet ratio | Minimum observed paired ratio | Maximum observed paired ratio | Strict loaded/quiet >2.5× |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Ubuntu Linux | **4.2093 ms** | **96.8104 ms** | **22.3021×** | **11.1036×** | **32.4442×** | **9/9** |
| Windows | **4.3940 ms** | **101.9457 ms** | **23.2011×** | **16.2406×** | **26.0495×** | **9/9** |

The quiet and loaded columns are approximate marginal medians, whereas the **reported 22.3021×/23.2011× are medians of individually paired ratios**, derived from exact saved raw measurements. Each of 18 trials also asserts `submittedDuringAttacker:true`, with measured trusted A-first to A-last private-work duration included in its raw audit record.

No result in this table is a claim about original CPU instructions. This is an **authenticated B service latency comparison**, with one legitimate account occupying the trusted server. The 2.5× threshold appears here only as an intuitive *relative queueing-delay* comparator; it is not a fresh original-versus-obfuscated CPU-budget population. The strict compute-budget veto separately remains demonstrated for small operations in [the fresh-process CPU audit](sco-batch-fresh-process-2026-11-18.md).

The earlier single-A-batch control `44237437271` was red on Windows because the 1,024-call burst sometimes completed before the independent child had submitted on Windows's coarse timer schedule. That red run is **an overlap-admission failure**, not a successful no-starvation claim. An intermediate prewarmed single-batch run `44237612500` passed the Ubuntu overlap/test with median relative latency 3.9121× and 9/9 >2.5×, but Windows again missed the required overlap and the overall workflow was red. The final source tests eight distinct, legitimate, individually capped requests concurrently and establishes strict overlap on both platforms; do not compare the three differently loaded populations as though they were identical.

## Security, policy and architectural implications

Successful private source withholding, authentication and **per-request** aggregate work admission are independently real in this experiment. Their combination does not establish isolation of competing legitimate principals inside a single-process, single-event-loop service. A valid Account A can submit multiple batches that crowd out an unrelated Account B. A principal-level quota, bounded queue, cancellation, or worker isolation could mitigate the observed policy failure, but each proposed mechanism requires new correctness, CPU and latency validation under concurrent load before production claims.

The test does not isolate operating-system scheduling, network paths, TLS or a multiworker deployment, and it does not prove that every valid batch will starve others. Its measured effect depends on workload size, concurrent legal request count, Node scheduling, and this chosen single-event-loop handler. A large B or an isolated worker pool could yield different ratios. The point is an **exact reproducible permitted-adversary counterexample** to the assumption that per-request work capping alone suffices for fair authorized service availability.

The client can still relay authorized outputs, as independently established by [matched public-minifier and actual Chromium attacks](sco-batch-equal-trust-relay-2026-11-18.md). The original JSON API has an own-`undefined` property shape mismatch, preventing a raw-all-JavaScript semantic equivalence claim. These are independent security and correctness vetoes.

**Decision:** retain opt-in coarse-batch SCO as bounded CPU-feasible for a predefined long-work, JSON-wire application, while **rejecting any general service-fairness or strict whole-workload 2.5× claim**. The next validated research direction would be to compare this exact two-principal workload under an explicit per-principal budget and a worker-isolated/private queue scheduler with actual outputs and whole-client/server CPU, rather than merely publishing smaller batch-size suggestions.
