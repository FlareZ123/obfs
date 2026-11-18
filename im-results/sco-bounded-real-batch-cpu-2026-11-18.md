# Bounded SCO source-private batching against a real private ESM application (18 November 2026)

**Status:** intermediate positive performance candidate with a strict sampled failure; deliberately not an unconditional 2.5x or hostile-runtime security claim.

## Actual compiler/server experiment

The research driver `sims/sco-batch-resident-cpu.js` parses the real `examples/application-challenge/sco-before/api.mjs`, compiles its exported async function with the project's `partitionScoAsyncModule({batch:true,maxBatchCalls:1024,serverOnlyInitialization:true})`, binds the original five private ESM modules on a trusted Node HTTP host, and publishes **only the compiler-generated batch-enabled facade** through `createScoHandler`. The genuine emitted facade is retrieved over HTTP under a caller token and imported from an isolated temporary file, so neither the benchmark's tested public source nor its private implementation is a manually mocked batch.

The selected server-side operation is `evaluateRemote(seed,count)`, and each batch uses the provided `createScoBatchMethod`, executing its 1,024 individual operations sequentially. The transport is JSON, and the server authorizes requests before native private execution. For both direct native and served-batch measurements, the original ESM graph, client import, and Node process have been initialized before the measured interval. Each paired observation performs exactly **12,288 original async function calls**: the native control invokes the original function directly in sequence, and the candidate invokes 12 authenticated HTTP batches of 1,024 operations. There are three warmups and 13 alternating-order pairs per workload. Each candidate result list has the same ordered JSON-wire outputs as the native baseline. Process CPU includes both trusted HTTP service and its local client, with no initializer or boot cost. Wall time includes serialized loopback HTTP wait.

The first validated implementation at exact source `82eb5c8ff170383a8bb6ac96e298e021f5349eb8` **passed** strict external JSDoc and all paired behavioral comparisons on Ubuntu and Windows Node `v22.23.4`, [manual workflow 44221434771](https://github.com/FlareZ123/obfs/actions/runs/44221434771). Raw timing arrays and exact toolchain versions are in that workflow's logs, with `npm ls --all` provenance.

| Private engine iterations per original call | Ubuntu batch/native CPU median ratio | Ubuntu observed strict CPU >2.5x | Windows batch/native CPU median ratio | Windows observed strict CPU >2.5x | Ubuntu/Windows wall ratio of medians |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | **3.982x** | **13/13** | **8.813x** | **12/13** | **5.393x / 5.672x** |
| 1,000 | **1.561x** | **0/13** | **2.006x** | **1/13** | **1.547x / 1.670x** |

All pairs' native and protected CPU observations were positive, including on Windows. Both 1,000-iteration populations received one-sided median verdict `supported` under the project's paired median diagnostic; both one-iteration populations were `exceeded`. Yet **one Windows 1,000-iteration pair exceeded the hard 2.5x CPU ceiling** (454ms versus 156ms), despite a median under 2.5x and zero wall violations. Thus strict sampled performance admission is still blocked. Both one-iteration populations remain decisively over budget, even when authenticated RPC overhead is amortized across 1,024 calls per request.

A separate real SCO single-call facade experiment, pinned in `im-results/sco-resident-process-cpu-2026-11-18.md`, measured 12,288 individual authenticated 1,000-iteration calls with approximately **30.95x Ubuntu / 20.36x Windows CPU overhead** in 13/13 strict violating pairs on each OS. These paired comparisons were made on separate source-pinned runs, so the ratio differences suggest a large batching improvement for this workload but are **not a same-run randomized factorial causal estimate**. The batch experiment independently and directly compares genuine batched execution against the original native path.

## Threat and semantic boundaries

- The original five private modules, state, and engine do not appear in the served stub. The trusted server remains uncompromised under SCO's threat model. This says nothing new about the difficulty of legitimate same-account online relaying, which remains available to an attacker with valid credentials.
- The emitted public batch API is **explicit opt-in**. It is not a semantics-preserving proof that arbitrary, externally observable, stateful or concurrent JavaScript calls can be regrouped. The fixed workload's source is deterministic and its corresponding calls are independent; order is still preserved sequentially within each batch.
- Both native and HTTP observations are compared after JSON serialization. The existing application's original `{value:undefined}` property is silently omitted by the JSON wire protocol. The raw object-shape negative witness is separately pinned in `test/sco-json-shape-contract.test.js`; this experiment makes no claim of full JavaScript graph/identity parity.
- The local same-process CPU total and loopback wall duration exclude cross-machine RTT, TLS, server-client CPU attribution, session contention and arbitrary input mixes. The experiment supports a bounded choice for this application, not a worst-case guarantee. The batch's 1,024-call ceiling and request size allowance are explicit resource and policy choices, with the server still checking each nested operation separately.

**Next decision:** Test a longer selected-work batch population with more Windows CPU samples to determine whether the observed strict Windows breach persists. Every positive security-performance selection must still withstand independent source and runtime attacks plus full application semantic and availability checks before release.


## Extended 51-pair stability challenge and authorization denials (02:18 UTC)

The two-platform [workflow 44222020060](https://github.com/FlareZ123/obfs/actions/runs/44222020060) passed at source `67a314244f1cc523688baaa04801c95e71a06229`. In addition to its original 13-pair/12,288-call populations, the separate `--stability` challenge ran **51 alternating native/batched pairs per operating system** at exactly 1,000 engine iterations per call and **24,576 calls per observation**, using 24 authenticated 1,024-call batches after startup and three warmups. This is an entirely new repeated-work population; it does not erase the prior 454ms/156ms Windows CPU outlier or claim that outlier was wrong.

| OS, Node v22.23.4 | 51-pair CPU ratio of medians | Median of paired CPU ratios | One-sided upper median bound (nominal 95%) | Strict observed CPU >2.5x | CPU pairs unresolved | Wall ratio of medians | Strict observed wall >2.5x |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Ubuntu | **1.5817x** | 1.5897x | 1.6077x | **0/51** | **0/51** | 1.5955x | **0/51** |
| Windows | **1.6240x** | 1.6240x | 1.6659x | **0/51** | **0/51** | 1.5901x | **0/51** |

The corresponding short 13-pair populations in the same workflow still had **13/13 strict Ubuntu CPU breaches** at just one engine iteration per call and **10 resolved Windows CPU breaches with one unresolved pair**. Thus the measured success depends on substantial protected work and batching; it cannot be generalized to arbitrary small operations.

The authenticated batch benchmark also now performs three explicit **real HTTP security controls before timing**: an unauthenticated source read must return 403, an unauthenticated batch RPC must return 403, and an authenticated outer batch with an invalid inner count (150001, beyond the declared maximum) must return 403 before private work. Both CI platforms passed these controls. This validates the tested policy enforcement path, without proving that arbitrary identity replay, source reconstruction or compromised client attacks are prevented.

The 51-pair evidence provides a stronger *sampled resident CPU feasibility signal* for this concrete large-batch workload. It **does not prove a universal worst-case 2.5x cap**: the distribution-free one-sided statistic concerns the population median and its assumption of independent representative trial pairs. Zero strict observed breaches leaves a nonzero statistical upper bound on future violation frequency; fixed-input, fixed-runner evidence cannot bound every browser, Node runtime, hardware or hostile deployment. The normal 13-pair/12,288-call Windows failure must remain visible as a separate workload observation. No new resistance to authorized functional relaying follows from the performance improvement.


## Closed-graph source and bounded aggregate batch work: final dual-platform replication

A further [strict-JSDoc, real-HTTP and CPU workflow 44223019270](https://github.com/FlareZ123/obfs/actions/runs/44223019270) succeeded on both OSes at exact main SHA **`1af22c99748dcf5575a513eba7a2f8e84c16c801`**. This source adds two independently relevant safeguards to the experimental deployment:

1. Before serving, it audits the complete original six-file ESM graph using the existing `build()` admission, and attaches every original source SHA-256 digest and private module path to the generated batch facade's publication manifest. That ties source withholding to the actual graph proof and the handler's byte/content checks rather than an experimenter's hard-coded path list.
2. In the trusted handler's outer batch authorization, it caps the **sum of all requested private engine iterations per batch at 1,024,000**, in addition to the existing 1,024-call ceiling and independent per-call argument checks. A genuine authenticated HTTP request attempting a 1,024-operation batch with 150,000 private iterations per operation received HTTP 403. Separate unauthorized public-source, unauthorized RPC and invalid-inner-count denials also passed. The workload under test (1,024 × 1,000) lies exactly on the declared admitted total-work boundary.

This adds a real resource-limiting example for a legitimate caller able to submit arbitrarily expensive batches; **it is only a per-request bound**, and cannot replace principal-level rate limiting, cross-account scheduling, burst/CPU quotas or data-transfer control. It must not be mistaken for hostile client tamper resistance.

The final two-platform sampled profile still found every 51-pair **24,576-call, 1,000-iteration** stability observation below 2.5× whole-process CPU and below 2.5× wall elapsed:

| OS | CPU ratio of medians, 51 pairs | One-sided upper median bound | Strict CPU >2.5× | Wall ratio of medians | Strict wall >2.5× |
| --- | ---: | ---: | ---: | ---: | ---: |
| Ubuntu | **1.2085×** | 1.2195× | **0/51** | 1.1943× | **0/51** |
| Windows | **1.3168×** | 1.3823× | **0/51** | 1.3107× | **0/51** |

The 13-pair 12,288-call 1,000-iteration control gave 1.2493× Ubuntu and 1.2811× Windows CPU ratios with zero strict over-budget CPU observations. In the same run, one-iteration calls remained over budget: Ubuntu 4.1582× CPU median and 13/13 strict breaches, while Windows had 10 strict breaches and one CPU-unresolved trial, plus all 13 wall breaches. These ratio changes from earlier runs reflect separate runner/time samples and are **not a measured causal speedup attributable to the new admission policy**.

All four full paired-timing JSON files are retained as successful run artifacts named `sco-batch-Linux` and `sco-batch-Windows`, each containing the ordinary 13-pair and amplified 51-pair observations with all raw CPU and wall durations. Dependency versions were recorded by `npm ls --all`. The source-pinned report is reproducible by rerunning the manual workflow, but the files are host-generated empirical observations, not immutable forecasts for all runtimes.

**Overall:** the most defensible deployment direction from this experiment is a *selective*, resource-admitted, coarse SCO server-private batch for applications whose authorized operation semantics make grouping correct. Exact raw JavaScript own-field semantics, tiny calls, unlimited legitimate online relay and arbitrary malicious client emulation remain independent unsolved goals. Security dimensions should not be inferred from a successful CPU benchmark.
