# Bounded SCO principal lookup reservation: exact HTTP behavior and paired CPU cost (18 November 2026)

**Evidence class:** opt-in trusted-server admission correctness plus scoped Node 22 profiler, not a strong-obfuscation protection result. The primary obfuscator remains **RELEASE-BLOCKED** under the 18 November [decision index](../results/README.md).

## Threat, change, and exact code

The existing `createScoKeyedIsolation` helper reserves `maxPendingTotal` globally before awaiting the authenticated principal resolver. This prevents an unlimited number of asynchronous identity lookups from entering uncounted. But with a resolver Promise that never settles, its slot remains occupied for the lifetime of that Promise, and a finite global cap can reject otherwise authorized requests for unrelated accounts. This can arise from a stalled trusted identity provider or request-dependent I/O. The attacker need not compromise the SCO server.

The new *opt-in* `maxPrincipalResolutionMs` validates a finite positive integer between 1 and 2,147,483,647 milliseconds. On unresolved lookup expiry, `createScoKeyedIsolation` throws `ScoIsolationBusyError` before private authorization or execution, and the actual `createScoHandler` emits generic HTTP **429**. The helper frees the global reservation. A subsequently fulfilled or rejected lookup can neither enter the per-principal FIFO queue nor call a protected method. Valid credentials succeeding before the deadline proceed unchanged; `maxPendingPerPrincipal` continues to apply only once identity is resolved.

An initial implementation at `e0373cc4094f9c56a85f37ab1a28679e4e107fb1` starts a Node timer for each pending async lookup; a later implementation first gives an already-settled Promise one microtask turn to finish, avoiding timer allocation on cached async verifications. It still creates a real deadline timer for unresolved Promises. Source `e8cd76dedc5635277c8f45da97c008ba3c4cbc5d` contains this optimization plus its successful/rejected immediate Promise and late rejected Promise regressions.

The deadline does not interrupt synchronous blocked JavaScript or cancel the resolver's ongoing external I/O. A blocked event loop may delay timer delivery. The helper serializes only calls sharing its in-process instance and cannot provide cross-worker, cross-process or cross-principal CPU fairness. A burst consuming global slots can still yield 429 for a legitimate B account until reservations free. The purpose is bounded admission of unresolved identity lookup, independent from client-side obfuscation.

## Reproduction and pinned validation

- `test/sco-principal-resolution-deadline.test.js`: constructor-range checks; isolated queue-reservation expiry and recovery; late fulfilled/rejected resolver results; already-running private operation; actual HTTP 429 response and next authorized HTTP 200. Existing `test/sco-keyed-isolation.test.js` and `test/sco-keyed-capacity.test.js` remain in the focused authorization matrix.
- `sims/sco-principal-resolution-cost.js`: 7 paired alternating-order postwarm trials for each of four populations, comparing the **same helper with optional deadline** against the **same helper without deadline**. Cases cover synchronous string identity vs immediate asynchronous Promise identity and either a tiny effect increment or a SHA-256 operation on 8 KiB per call. CPU comes from `process.cpuUsage`, wall time from `process.hrtime.bigint`. The simulator prints original per-pair ratios and treats a Windows zero-CPU-quantum sample as unresolved, never as a zero-cost success. It checks exact protected-effect equality.
- [Initial Linux/Windows authorization CI 44243086456](https://github.com/FlareZ123/obfs/actions/runs/44243086456) at `e0373cc4094f9c56a85f37ab1a28679e4e107fb1`: both jobs green, targeted SCO Node22 tests and two JSDoc gates passed.
- [Unoptimized profiler 44243963075](https://github.com/FlareZ123/obfs/actions/runs/44243963075) at `c35d99e460d67449ea3472014dc5de4198295a40`: both OS green after correcting a profiler error exposed by Windows CPU timer quantization; exact timings appeared in each job's printed `OBFS_SCO_PRINCIPAL_DEADLINE_COST` record.
- [Optimized profiler and correctness CI 44244635187](https://github.com/FlareZ123/obfs/actions/runs/44244635187) at `e8cd76dedc5635277c8f45da97c008ba3c4cbc5d`: Ubuntu and Windows Node22 green, including strict external JSDoc. The profiler used 250,000 calls per tiny-work pair and 25,000 calls per 8 KiB pair, seven pairs per population.

## Measured opt-in overhead relative to existing SCO keyed isolation

Each row is the **median of paired candidate/baseline CPU ratios**, with the count of strict over-2.5x CPU ratios. In-process hot microbenchmarks exclude actual HTTP transport, TLS and browser startup, external identity-provider I/O, application-native-vs-generated comparisons, and multi-account contention.

| Pinned implementation | Resolver and per-call private work | Ubuntu median CPU, strict breaches | Windows median CPU, strict breaches |
| --- | --- | --- | --- |
| Timer on every async lookup, `c35d99e` | Cached synchronous identity, tiny effect | 0.935x, 0/7 | 0.940x, 0/7 |
| Timer on every async lookup, `c35d99e` | Cached asynchronous identity, tiny effect | **2.650x, 5/7** | **3.014x, 6/7** |
| Timer on every async lookup, `c35d99e` | Cached asynchronous identity, 8 KiB SHA-256 | 1.172x, 0/7 | 1.137x, 0/7 |
| Deferred timer on already-settled Promise, `e8cd76d` | Cached synchronous identity, tiny effect | 0.925x, 0/7 | 0.847x, 0/7 |
| Deferred timer on already-settled Promise, `e8cd76d` | Cached asynchronous identity, tiny effect | **1.194x, 0/7** | **1.120x, 0/7** |
| Deferred timer on already-settled Promise, `e8cd76d` | Cached asynchronous identity, 8 KiB SHA-256 | 1.047x, 0/7 | 1.000x, 0/7 |

The initial per-request timer path had clear opt-in compute-budget violations even relative to *another protected server helper*, before comparing against the native application. The optimized path did not exceed 2.5x in these tested paired populations. Comparisons between the two pinned CI runs are descriptive, not a same-process causal speedup estimate. All measured samples are bounded empirical observations, not a worst-case CPU bound. Windows CPU tick quantization makes individual ratios noisy.

## Decision and follow-up

Retain optional `maxPrincipalResolutionMs`, defaulting to unlimited, for deployments whose verified-session resolver can hang. Set an upstream provider timeout as well, because helper expiry does not cancel underlying I/O. Operators must still measure real end-to-end B-tenant latency under valid A-account bursts, global queue saturation and application-wide native-versus-SCO compute. The optimization is a useful guarded correctness/resource admission feature, with no evidence of increased static reconstruction resistance, anti-relay protection, or universal 2.5x compliance.

Further progress would require cancellation propagation through the identity provider, bounded provider-side outstanding requests, actual multi-principal fairness, and source-pinned real HTTP/TLS+browser before recommending production policies. These require explicit authorization semantics and a comparable ordinary trusted-server control.

## Cooperative upstream cancellation and the 21-pair strict tail

At source `36bbdf159e79413679598b2e07ccbe9dc2ecef4e`, the optional `abortPrincipalLookup:true` additionally supplies a new `AbortSignal` as the verifier's second argument and calls `AbortController.abort()` when its deadline timer expires. It requires a finite `maxPrincipalResolutionMs`. Existing one-argument resolvers and cancellation-disabled instances are unchanged. This feature follows the Node 22 [AbortController contract](https://nodejs.org/download/release/v22.17.0/docs/api/globals.html): a signal permits *cooperating* Promise-based I/O to be canceled; it cannot forcibly stop arbitrary JavaScript. Controller creation is itself request-time work, so cancellation is opt-in.

The simulator's extra comparison enables this abort controller even when the cached resolver immediately resolves. This exposes its worst lightweight cached-session allocation overhead without claiming a real identity-provider I/O workload. A separate `test/sco-principal-resolution-deadline.test.js` verifies the signal is actually aborted on timeout and remains un-aborted on success. Crucially, it exercises a real local Node HTTP identity-provider `fetch(endpoint,{signal})` that intentionally never responds on its first request: after helper expiry, the provider observes response closure, the protected method remains uninvoked, and the next authenticated identity-fetch succeeds. [CI 44245920374](https://github.com/FlareZ123/obfs/actions/runs/44245920374) verified this test on Linux/Windows at exact `71871b94125634b2fe4e67cdb61e51eab2b01de8`.

The [final targeted, paired tail CI 44246146244](https://github.com/FlareZ123/obfs/actions/runs/44246146244) passed Linux/Windows Node22 strict JSDoc and all SCO tests at exact `36bbdf159e79413679598b2e07ccbe9dc2ecef4e`. To probe the earlier short-work ceiling risk, the cancellable variants ran **21 paired trials per population and OS**; their control variants retained seven trials each. Every paired effect and CPU/wall sample was recorded in the job logs.

| Cancellable immediate-async lookup workload | Ubuntu median CPU | Ubuntu max CPU | Windows median CPU | Windows max CPU | Strict CPU >2.5x |
| --- | ---: | ---: | ---: | ---: | --- |
| Tiny effect per operation, 250,000 operations per pair | 1.673x | 1.853x | 1.506x | 2.014x | **0/21 per OS** |
| SHA-256 of 8 KiB per operation, 25,000 operations per pair | 1.056x | 1.154x | 1.068x | 1.294x | **0/21 per OS** |

Wall-time was separately logged: tiny-work median 1.727x Ubuntu / 1.706x Windows, no strict >2.5x observed in either population. In the final source's cancellation-disabled cached-async tiny-control population (7 pairs), median CPU relative to default helper was 1.163x Ubuntu / 1.248x Windows, no strict breaches. Comparing `abortPrincipalLookup:true` to default helper is **not** an isolated estimate of cancellation versus deadline-only overhead because both options are layered. All data are warm Node22 direct-helper microbenchmarks, with no real TLS/browser, no native-to-compiled whole-app budget, and no claim of stochastic upper-bound protection.

**Operational conclusion:** a deadline is appropriate only when the service explicitly accepts bounded identity-provider admission. Add cooperative abort for identity clients that actually honor `AbortSignal`, and profile it with their real upstream latency and CPU. Neither the 21/21 passing samples nor generic 429 responses establish cross-account scheduling fairness or resistance to unlimited valid private RPC requests. The prior release-blocked decision is unchanged.
