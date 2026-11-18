# Same-trust worker-thread SCO transport comparison (18 November 2026)

## Result and source pin

An ordinary authenticated Node HTTP endpoint using the **same prestarted original private per-principal worker threads** had essentially the same measured cross-account loaded B service latency as the generated SCO endpoint. Seven alternating, same-secret pairs per OS completed with exact native private outputs, HTTP 200, independent B submission during actual A private execution, and zero sampled strict >2.5x B/direct-original latency ratios in either arm.

- **Original measured executable source:** [fc29b60c5ed3ba99a2527b2498a6d0fc06f6f901](https://github.com/FlareZ123/obfs/commit/fc29b60c5ed3ba99a2527b2498a6d0fc06f6f901). [Original completed two-platform gate 44252329146](https://github.com/FlareZ123/obfs/actions/runs/44252329146) produced the raw latency pairs below.
- **Later hardened source and complete Linux/Windows Node 22 gate:** [99bd7e955f772c6381c8b71dc8170488ad8c76e4](https://github.com/FlareZ123/obfs/commit/99bd7e955f772c6381c8b71dc8170488ad8c76e4), [run 44253272595](https://github.com/FlareZ123/obfs/actions/runs/44253272595). Both jobs green, including both strict JSDoc suites, the preexisting generated synchronous/worker comparison, worker policy regression, independent generated/ordinary authentication and JSON admission tests, and the same seven-pair two-arm comparison. The later code observes aborted ordinary HTTP request streams; unchanged accepted workloads are still emitted through the same original private worker.
- Reproduction entry: [sims/sco-worker-equal-trust.js](../sims/sco-worker-equal-trust.js). Original shared worker trial implementation and ordinary-control addition: [sims/sco-ratchet-worker-http-contention.js](../sims/sco-ratchet-worker-http-contention.js). Manual-only workflow: [manual-sco-ratchet-worker-http.yml](../.github/workflows/manual-sco-ratchet-worker-http.yml).
- The independently written experimental intent and stop criteria are in [pre-registration](../workplace/sco-worker-equal-trust-preregister-2026-11-18.md). That written note was committed after the executable CI source pin, before using the completed two-platform evidence for this report.

## Equal-trust construction

Every pair used one fresh 32-byte root secret shared only between its two *trusted* service arms, with a fresh service per arm and alternating arm order. Both hold the same server-original 8 MiB-per-event HMAC private ratchet. The private worker operation was factored into the single \`workerBatch\` implementation invoked by **both** HTTP handlers, eliminating a private-computation discrepancy. Both use identical per-principal prestarted workers, session-cookie mapping, per-principal FIFO isolation, admission limits, 65,536-byte maximum request body and method/argument schema.

The generated arm calls \`createScoHandler\` and publishes a generated client facade. The **ordinary-worker** arm uses a conventional Node \`http.RequestListener\` and does not call the generated handler or serve a facade. The actual child HTTP B process uses the same cookie, URL, method and JSON body for both. Each sample verifies 64 private A events, 16 loaded B events and two separate 16-event quiet B controls. It also verifies that the independent B submission timestamp lies *inside* actual private A-worker work, and checks native outputs and HTTP 200. Worker initialization is outside the measured B interval.

This holds server trust, original secret, private compute, stateful principal and concurrency topology fixed. Remaining differences include outer HTTP parsing and implementation details, which are the intended incremental transport comparison.

## Raw two-platform observations

The target metric is each pair's **generated SCO B loaded HTTP service milliseconds / ordinary-worker B loaded HTTP service milliseconds**. A value near 1 means similar observed latency. Direct-original B CPU timing was separately recorded per arm for strict-budget checks.

| Trial | Ubuntu generated B ms | Ubuntu ordinary B ms | Ubuntu incremental ratio | Windows generated B ms | Windows ordinary B ms | Windows incremental ratio |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 117.24601 | 109.37644 | 1.07195 | 117.81480 | 119.68220 | 0.98440 |
| 2 | 115.93554 | 109.74972 | 1.05636 | 115.53240 | 115.20090 | 1.00288 |
| 3 | 109.53883 | 110.24887 | 0.99356 | 117.60420 | 120.50540 | 0.97592 |
| 4 | 111.62060 | 115.85002 | 0.96349 | 121.66950 | 118.07980 | 1.03040 |
| 5 | 113.91848 | 108.68269 | 1.04818 | 117.27580 | 116.41760 | 1.00737 |
| 6 | 114.32304 | 110.86804 | 1.03116 | 116.71340 | 117.94600 | 0.98955 |
| 7 | 109.75116 | 111.48479 | 0.98445 | 121.03410 | 128.59350 | 0.94121 |

| Quantity | Ubuntu 22 | Windows 22 |
|---|---:|---:|
| Alternating same-root fresh-server comparisons | 7 | 7 |
| Median generated / ordinary loaded B latency | **1.03116x** | **0.98955x** |
| Maximum generated / ordinary loaded B latency | 1.07195x | 1.03040x |
| Generated SCO B / direct-native strict >2.5x breaches | **0/7** | **0/7** |
| Ordinary-worker B / direct-native strict >2.5x breaches | **0/7** | **0/7** |
| Genuine independent B-inside-A and exact output checks | 7/7 | 7/7 |

The full log preserves each arm's independent native 16-event timing and quiet controls. The selected native B reference durations were approximately 74–81 ms per Ubuntu arm and 74–76 ms per Windows arm, not a universal or fixed baseline.

## Interpretation and release decision

This is **positive evidence for generic trusted-server worker isolation** in this narrow one-A-principal fairness scenario and **negative incremental-attribution evidence** for crediting the generated SCO HTTP facade with that latency improvement. The matched service ratios cluster near 1 and both arms pass the sampled 2.5x service-latency threshold. Under the prompt's full-control client and unlimited authorized requests, neither arm gains anti-relay protection from worker placement: the same operation is exposed to authorized callers. That latter security boundary is established separately by the existing equal-trust online-relay tests, not by timing alone.

The observations do **not** show a significant difference in authorized attacker reconstruction cost, cryptographic extraction, tamper bypass or environment lock. They also do not prove equivalence for all load patterns, or that SCO has zero transport overhead. Timing noise and only seven paired samples per OS limit the inference.

**Important exclusions:** The metric is B HTTP service latency under one legal A batch. It does not measure total parent+worker+client CPU, startup, memory/resource allocation per principal, multiple hostile accounts, TLS/WAN, all browser-facing costs or a universal strict 2.5x performance guarantee. The independent [multi-principal saturation test](sco-ratchet-worker-multi-principal-2026-11-18.md) still reports B service-latency breaches under eight independently verified A accounts. The universal strong-protection release decision remains **BLOCKED**.

## Next decision-relevant work

Avoid repeating the same worker-versus-sync comparison as evidence of additional obfuscation security. If worker isolation is developed as an availability feature, compare it to a conventional worker service of equal trust and add bounded global worker admission, queue observability and adversarial multi-principal scheduling before claiming broad fairness. A distinct strong-obfuscation candidate would need its own independent attacker-cost advantage over ordinary minification/servers plus strict hot-work and whole-session budget evidence.
