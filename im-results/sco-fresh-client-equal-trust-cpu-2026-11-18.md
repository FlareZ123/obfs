# Fresh-client whole-process SCO batching against equal-trust esbuild-minified RPC (18 November 2026)

**Status:** replicated source-pinned intermediate result, **no release approval**. Strict total original-to-generated compute violations occur even with the actual initialized server, despite near-parity with an equal-trust conventional minified RPC client. The test uses an actual published ESM in a newly launched Node client process and the original trusted six-file private server graph.

## Source, pre-registration and full evidence

- **Measured executable source:** [\`17f451d665d1aa43bc4a43d6297b01487a6b7060\`](https://github.com/FlareZ123/obfs/commit/17f451d665d1aa43bc4a43d6297b01487a6b7060). Strict external JavaScript JSDoc and the full fresh-process 9-triple run passed on Ubuntu and Windows Node 22 in [GitHub Actions run 44256324039](https://github.com/FlareZ123/obfs/actions/runs/44256324039).
- [Preregistered comparison and kill rules](../workplace/sco-fresh-client-equal-trust-cpu-preregister-2026-11-18.md). Source: [three-way harness](../sims/sco-batch-fresh-process-cpu.js), [actual fresh Node process ESM executor](../sims/sco-batch-process-client.cjs), [ordinary esbuild-minified equal-trust facade](../sims/sco-batch-equal-trust-attacker.js).
- Full nine-pair per-workload per-OS original, generated and ordinary **process CPU** and wall measurements are retained under CI output marker \`SCO_BATCH_FRESH_PROCESS\` and GitHub Actions artifacts \`sco-batch-process-Linux.json\`, \`sco-batch-process-Windows.json\`. The artifact files include separately measured parent server CPU, fresh child CPU, all source digest commitments, confidence diagnostics and strict breach counts.
- Published generated ESM SHA-256: \`cb291da729382b15fecc4be136455ff7ee65645427702f6f902dca09c1d1c5ba\`; ordinary esbuild-minified ESM SHA-256: \`8474c8ae9acc14b19f0330d4118cea9397da00e5b84a8a50e40fc0f1ba511321\`. Both exact downloaded ESM files are authenticated under the *same* trusted server and original private method registry; no private source is served.

## Matched trust and computation

For each of the two workloads, each nine-trial triple starts three genuinely **new Node child processes** in a rotated six-order crossover:

1. **Native original:** loads the original \`evaluateRemote\` ESM and computes 12,288 original results.
2. **Generated SCO:** downloads the authorized actual compiled ESM facade, compiles/imports it, then performs 12 authenticated 1,024-call RPC batches against the original server graph.
3. **Ordinary minified:** downloads a separately served, equally authorized esbuild-minified ESM client with the **same generated wire method IDs**, compiles/imports it, then executes the same 12 original server batches.

The trusted server is preinitialized, as allowed by the SCO server initialization exception. The fresh child process **is not preinitialized**; its whole CPU from process launch is included. The observed total compute CPU is server-parent user+system CPU during the child trial **plus** the fresh child user+system CPU. Wall time from just before child process launch through complete output digest is also preserved, separately. The same server secret, original six-file private graph, authorization bearer, request body shape and 1,024-call work quota apply to both RPC clients. All three arms generated the **identical SHA-256 of all 12,288 ordered JSON values** per triple. Both published sources were hash checked against the real authenticated HTTP responses; unauthorized source fetches were HTTP 403.

The two work populations are **1 original iteration/call** and **1,000 original iterations/call**, 12,288 calls each. Every strict CPU result compares paired measured whole-process CPU against native original; any ratio **greater than 2.5×** is a workload failure regardless of a green median or confidence bound.

## Two-platform measured totals

Ratio-of-medians divides the median actual total CPU of the first arm by the median CPU of the named baseline. The incremental ratio compares generated and ordinary **equally server-private** RPC clients. Strict breaches are *per-pair actual CPU* >2.5×, not a test of mean CPU or only a statistical confidence interval.

| OS | Original iterations/call | Generated / native CPU ratio-of-medians | Generated/native strict CPU breaches | Ordinary minified / native CPU ratio-of-medians | Ordinary/native strict CPU breaches | Generated / ordinary incremental CPU ratio-of-medians | Generated/ordinary strict CPU breaches |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Ubuntu Node 22 | 1 | **3.37944×** | **8/9** | **3.38697×** | **8/9** | **0.99778×** | **0/9** |
| Ubuntu Node 22 | 1,000 | **1.97625×** | **0/9** | **1.91056×** | **0/9** | **1.03438×** | **0/9** |
| Windows Node 22 | 1 | **2.80128×** | **6/9** | **2.59615×** | **5/9** | **1.07901×** | **0/9** |
| Windows Node 22 | 1,000 | **1.94340×** | **1/9** | **1.88302×** | **0/9** | **1.03206×** | **0/9** |

The incremental **median of nine paired generated/ordinary CPU ratios**, a distinct estimator from ratio-of-medians, was **0.99787× Ubuntu-1**, **1.01378× Ubuntu-1000**, **1.03800× Windows-1**, **1.06214× Windows-1000**. Its \`pairedBudgetBound\` 95% requested-confidence upper median bounds were respectively **1.04302×**, **1.06091×**, **1.16845×**, **1.15631×**. Even with a good incremental ratio, the short-work original-normalized compute result is not compliant.

The 12,288-call original-CPU median on Ubuntu was **102.320 ms** at 1 iteration, versus **345.784 ms** generated and **346.555 ms** ordinary. At 1000 iterations it was **258.285 ms** native, **510.436 ms** generated, **493.469 ms** ordinary. Windows original/compiled/ordinary CPU medians were **156/437/405 ms** at 1 iteration and **265/515/499 ms** at 1000 iterations. The first CPU sample in the Ubuntu-1 native population was substantially higher than later samples; using all nine *paired* ratios still gives **8/9** strict short-work violations in both RPC arms. Windows timing exhibits coarse process CPU tick quantization and higher pair-to-pair variability.

## Whole-session wall time (separate from the compute rule)

| OS | Original iterations/call | Generated / native wall ratio-of-medians | Generated/native strict >2.5× wall | Ordinary / native wall ratio-of-medians | Ordinary/native strict >2.5× wall | Generated/ordinary wall ratio-of-medians |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Ubuntu | 1 | 2.93769× | 8/9 | 2.96563× | 8/9 | 0.99058× |
| Ubuntu | 1,000 | 1.67275× | 0/9 | 1.64865× | 0/9 | 1.01461× |
| Windows | 1 | 2.45860× | 4/9 | 2.53950× | 3/9 | 0.96814× |
| Windows | 1,000 | 1.59515× | 0/9 | 1.58043× | 0/9 | 1.00931× |

Wall metrics include scheduling, process startup and localhost server response and are informative operationally, while the prompt's explicit **compute-time** threshold should be evaluated from the user+system CPU totals above. The one 1000-iteration Windows generated/native CPU strict breach is a genuine sampled veto even with a good 1.94340× median, zero wall breaches and a nominal statistically \`supported\` bound.

## What this does and does not establish

**Observed:** the generated SCO ESM facade and an ordinary esbuild-minified ESM wrapper have closely matched *incremental* total CPU at identical trust boundary and original server work for these two 12,288-call populations, 0/9 strict generated/ordinary incremental CPU failures across every population/OS. Both variants breach the native-compute limit on short calls. The high-cost factor in this experiment is the fresh-process/network/RPC service contract available to an ordinary authorized minified client as well; the experiment does not attribute that entire cost to generated obfuscation syntax. At larger per-call work, performance improves materially, but the Windows generated-native 1/9 strict CPU breach prevents a clean universal budget claim.

**Not established:** static reconstruction resistance, same-account online-relay resistance, inability to clone outputs, tamper resilience, general JS behavior outside the declared JSON-wire contract, global CPU fairness, real Chromium/browser costs, network/TLS, multi-account B availability or source secrecy attributable *specifically* to generated client syntax. The ordinary minified client deliberately keeps the private server source equally unavailable, so secrecy of the trusted original is a generic trust-boundary property. Full security release remains **BLOCKED**.

**Next discriminating step:** preserve the emitted bytes and measure generated versus equal-trust minified client static/dynamic reconstruction and authorized modification attacks with comparable attacker effort. Any strong release claim still requires complete lifetime and selected-hot-work strict CPU compliance, including native source and browser startup where applicable.
