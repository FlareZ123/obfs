# SCO authenticated fresh client-facade session CPU audit (18 November 2026)

**Status:** reproduced empirical Node experiment with explicit limitations. This is an intermediate engineering measurement, not an obfuscation security result or release clearance.

## Exact source and evidence

- Source revision: `94cfba20ccca296e7ae46a9d01a1778a7e868a04`.
- [Linux and Windows Node 22 workflow 44233280522](https://github.com/FlareZ123/obfs/actions/runs/44233280522): both jobs **succeeded**, including external strict JSDoc, authenticated HTTP policy denials, value equivalence, 13-pair ordinary workloads, 51-pair resident stability and the new 13-pair fresh-client workloads.
- Reproducer: `node sims/sco-batch-resident-cpu.js --fresh-client-module`, dispatched by `.github/workflows/manual-sco-batch-cpu.yml`. Without the flag, the existing resident-only control remains unchanged. `--stability` selects the separate long 51-pair population.
- Complete timing arrays and metadata are retained as CI artifacts `sco-batch-Linux` and `sco-batch-Windows`, each including `sco-batch-fresh-client-<OS>.json`; the workflow also records `npm ls --all`.
- Original private operation: the actual six-file application-challenge ESM graph, through `evaluateRemote(seed,count)`. The server generated the public batch ESM facade using `partitionScoAsyncModule({batch:true,maxBatchCalls:1024,serverOnlyInitialization:true})`, and served it through authenticated `createScoHandler`. The server validates aggregate declared work at 1,024,000 iterations, checks every nested operation and denies unauthorized source/RPC HTTP requests.

## Measurement

Each observation executes **12,288 original operations** on each side, grouped into 12 authenticated 1,024-operation requests on the remote side. The native baseline invokes the original private ESM method sequentially. Both sides run in the **same Node process** and report its whole-process user+system CPU time plus wall elapsed. Order alternates across 13 pairs, following three warmups. Every ordered output is checked at the explicitly declared JSON-wire boundary.

In the new `--fresh-client-module` branch, **each measured remote session** fetches the real generated JavaScript facade from HTTP under its token, reads the body, creates a unique Node ESM `data:` URL to prevent module-cache reuse, compiles/imports that fresh public module, and invokes its batch method. This entire sequence falls *inside* the protected observation window. The original native ESM function is already loaded on its trusted server, and server-side private initialization is excluded from both measurements.

| Operating system, Node v22.23.4 | Engine iterations per original call | CPU ratio of medians, remote/native | Strict >2.5x CPU pairs | Wall ratio of medians | Strict >2.5x wall pairs |
| --- | ---: | ---: | ---: | ---: | ---: |
| Ubuntu Linux | 1 | **3.8712x** | **13/13** | 4.9110x | **13/13** |
| Ubuntu Linux | 1,000 | **1.4002x** | **0/13** | 1.3471x | 0/13 |
| Windows | 1 | **8.7500x** | **11/13** | 6.2810x | **13/13** |
| Windows | 1,000 | **1.9936x** | **0/13** | 1.6771x | 0/13 |

All 52 CPU pairs were resolved, with no zero-CPU observation. For the 1,000-iteration fresh-client populations, the preexisting one-sided paired-median diagnostic reported upper bounds **1.4144x** (Ubuntu) and **1.9873x** (Windows), at attained nominal confidence 0.953857. The short-work population's diagnostic reported `exceeded` on both operating systems. The paired-median confidence interval is not a guarantee against any strict over-budget observation.

For context, the *same workflow's* resident-only 13-pair control measured 1,000-iteration CPU ratio of medians **1.3474x** Ubuntu and **1.6433x** Windows. That resident Windows population had **one actual strict >2.5x CPU pair**, even though the separately sampled fresh-client Windows population had zero. The workload shapes agree but the observations are distinct. Do not subtract the two sampled ratio medians to attribute a causal bootstrap cost.

The independently retained 51-pair **resident-only** amplified population measured CPU ratios of medians **1.3243x** Ubuntu and **1.6366x** Windows for 24,576 calls with zero observed strict CPU breaches. It excludes client startup and cannot replace the fresh-client trial.

## Limits and release decision

1. **Partial client initialization:** This includes an authenticated public JavaScript download and fresh **Node ESM module compilation/import** for every measured remote session, in addition to its RPC calls. It does **not** start a fresh browser or Node process, load an entire client-side application graph, measure realistic WAN/TLS, or incorporate startup cost of the native client counterpart. Connections, trusted private graph and HTTP server are warm. The result is closer to the prompt's correct accounting boundary, yet is not complete cold-session compliance.
2. **Scope of compute:** Process CPU accounts for both client and server because they share one Node process; wall time includes HTTP loopback waiting. Real browser and distributed process CPU accounting remain unmeasured. The server-start exclusion is permitted for trusted SCO startup; there is no equivalent client-initialization exemption. The experiment deliberately includes the newly fetched facade module on the protected side.
3. **Semantics:** Results are compared after JSON serialization. Real native own `undefined` fields do not survive the generated JSON-wire RPC; `test/sco-json-shape-contract.test.js` is an executable counterexample to unrestricted 1:1 JavaScript observational equivalence. Batching is explicit API selection, not transparent source-level automatic grouping.
4. **Threat model:** The server's private implementation is withheld from the published facade, and the tested HTTP authentication checks pass. A legitimate attacker can still relay all authorized batch results from the original service. No independent static/dynamic security advantage over an equal-trust ordinary minified RPC was shown here.
5. **Strict performance admission:** Both short-work populations have multiple direct **>2.5x** measured CPU failures. Even 0/13 strict breaches on longer work, under independent representative sampling assumptions, permits a one-sided 95% future breach-rate bound of roughly **20.58%** per fixed population; for two simultaneous 95% Bonferroni platform bounds, **24.71% each**. These conditional statistical statements are not worst-case caps and do not erase other source-pinned strict breaches.

**Decision:** Keep this specific long-work, explicitly batched SCO configuration as a promising *bounded CPU-performance experiment*. General-purpose SCO obfuscation release remains blocked by the observed short-work CPU veto, unproved full client-session cost, narrower JSON-wire contract, valid-client relay and absent equal-trust attacker advantage.

Further validation should use a real browser whose actual generated facade is fetched over a production-shaped HTTPS session, a matched ordinary client/minified server-private service and native baseline, client-inclusive CPU accounting across both processes, and predeclared mixed-operation adversarial workloads. Separate cross-principal scheduling probes from per-request quotas; a large valid batch can still block other users in a synchronous server.
