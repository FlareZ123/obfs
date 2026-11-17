# Fresh SCO client crossover grid under eight operation granularities (2026-11-17)

**Status:** source-pinned intermediate application performance and native-equivalence evidence. These are sampled budget decisions under a controlled benchmark boundary, not a universal 2.5× performance guarantee or obfuscation-security result.

## Design

The original frozen [six-module application](../examples/application-challenge/README.md) has a trusted SCO server withholding five private modules and serving a 515-byte asynchronous public facade. The [prior cold-session benchmark](application-challenge-sco-source-relay-2026-11-16.md) tested three one-event calls and three 120,000-event calls. To locate the measured compute-granularity transition, I fixed the public client, server fixture, seed triple and native executable, then varied only **events per call**.

New reproducible profiler: \`node sims/application-challenge-sco-count-grid.js\`. It launches a fresh Node process per observation, makes exactly **three calls per process** at 1, 1,000, 10,000, 30,000, 60,000, 90,000, 120,000 or 150,000 events per call, and records native/remote time from process launch through complete JSON output. Every output is compared to the corresponding native JSON, including warmup. There are **11 matched native/remote timing pairs per granularity** per OS, with alternating run order. Server initialization occurs once outside all measured child runs, matching only the prompt's explicit **trusted SCO server** initialization allowance. Local HTTP/1.1 on 127.0.0.1, no TLS/WAN/auth database.

**Pinned verified run:** [43999823921](https://github.com/FlareZ123/obfs/actions/runs/43999823921) at checked-out SHA \`37205dde127bd5a28e26bfaa43c19079d1fad1ff\`; Ubuntu job **133760802976**, Windows job **133760802688**, Node v22.23.4. Both succeeded with strict JSDoc, native/remote correctness, the previous cold/bootstrap profiles, and real Ubuntu Chromium. An earlier exact-source [red run 43999561495](https://github.com/FlareZ123/obfs/actions/runs/43999561495) correctly revealed that the newly added profiler and previously un-checked demo server had strict JSDoc errors; commits \`e958713a\` and \`37205dde\` repaired them with no algorithmic change to the obfuscator. Do not present the red run as a behavioral or performance failure.

## Source-pinned ratios and paired decisions

Each entry is **SCO/native ratio of the two separate sample medians**, followed by a classification of the **median of 11 within-trial ratios**, using the existing distribution-free order-statistic helper. An \`exceeded\` decision means the one-sided lower order-statistic endpoint is above 2.5×, \`supported\` means its upper endpoint is at/below 2.5×, and \`inconclusive\` straddles the limit. These one-sided endpoints have nominal coverage **96.73%** under independent identically distributed paired trials on a fixed runner/workload, a stronger assumption than the hosted-runner experiment itself verifies.

| Events per call (3 calls/session) | Ubuntu median ratio | Ubuntu paired decision | Windows median ratio | Windows paired decision |
|---|---:|---|---:|---|
| 1 | 4.424× | Exceeded | 2.994× | Exceeded |
| 1,000 | 4.241× | Exceeded | 2.969× | Exceeded |
| 10,000 | 3.333× | Exceeded | 2.600× | Exceeded |
| 30,000 | 2.901× | Exceeded | 2.493× | Inconclusive |
| 60,000 | 2.604× | Exceeded | 2.257× | Supported |
| 90,000 | 2.517× | Inconclusive | 2.203× | Supported |
| 120,000 | 2.398× | Supported | 2.175× | Supported |
| 150,000 | 2.371× | Supported | 2.069× | Supported |

The most informative bracketing endpoints of the *paired-median slowdown*, with selected native and protected absolute medians:

| Platform and count | Native ms | SCO ms | 11-pair lower bound | 11-pair upper bound | Decision |
|---|---:|---:|---:|---:|---|
| Ubuntu, 60,000 | 53.832 | 140.200 | 2.522× | 2.660× | Exceeded |
| Ubuntu, 90,000 | 56.558 | 142.373 | 2.458× | 2.591× | Inconclusive |
| Ubuntu, 120,000 | 58.616 | 140.578 | 2.376× | 2.478× | Supported |
| Windows, 10,000 | 68.675 | 178.523 | 2.568× | 2.693× | Exceeded |
| Windows, 30,000 | 72.680 | 181.190 | 2.333× | 2.542× | Inconclusive |
| Windows, 60,000 | 82.066 | 185.253 | 2.143× | 2.297× | Supported |

All 176 native/protected samples and their within-trial ratios were emitted to the pinned CI logs. The profiler itself and output schema are committed. Exact observations are available from the two jobs, not reconstructed by interpolating medians.

## Interpretation and limits

1. **Short operations fail the cost requirement under the tested startup-inclusive boundary.** All both-platform counts at or below 10,000 events are above 2.5×, including their paired lower bounds. This is stronger evidence than selecting only the shortest one-event control.
2. **The apparent transition differs materially by runner.** On this exact session/configuration, Windows first reaches a sampled \`supported\` decision at 60,000 events, while Ubuntu first does so at 120,000. A deployment should not infer a portable safe count from either threshold. Intermediate count samples and random CI variation leave the continuous crossover unresolved.
3. **The client bootstrap and server assumptions matter.** The native side launches a six-module ESM application; the protected side launches a CommonJS relay-worker importing one ESM facade with loopback HTTP RPC. Those differences are included in this actual application comparison, and cannot be attributed to just the compiler or transport. Cloud WAN/TLS/reverse proxy and real authentication storage are excluded. A different number of calls per process changes startup amortization.
4. **Statistical scope is narrow.** The order-statistic decisions assume iid, continuous paired ratios and characterize the *population median of paired ratios*, not the worst-case slowdown, ratio of population medians, or a future machine's expected performance. Sequentially measuring eight workloads on one runner, without independent days/machines and multiple-comparison correction, further limits any aggregate claim. The report supports a measurable local crossover trend, not an analytic complexity or universal budget theorem.
5. **Source-private functional cloning remains possible for an authorized user.** Correctness compares complete output and the same isolated public-only relay worker. The strong-side SCO property is withheld server source and server-controlled authorization. This benchmark adds no evidence of offline reconstruction difficulty or online relay prevention.

**Decision:** the existing SCO facade is demonstrably budget-incompatible with fine-grained three-call sessions under both sampled environments. Treat operation granularity and end-to-end client startup cost as explicit deployment parameters. Evaluate representative production network and workload distributions before requiring a 2.5× cap, and reject any blanket performance guarantee from the isolated heavy passes.
