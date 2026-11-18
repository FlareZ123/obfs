# SCO 12,288-operation fresh Node client plus trusted-server CPU audit (18 November 2026)

**Evidence class:** actual Linux/Windows end-to-end Node process experiment, intermediate. **Release remains blocked.**

## Provenance and corrected harness

The source-pinned [manual Linux/Windows workflow 44234669255](https://github.com/FlareZ123/obfs/actions/runs/44234669255) **passed both jobs** at exact Git commit `7c6d38c79d010e9e8158ed61616c6dfde77ebebb`. Node was `v22.23.4` on each runner. Both strict external JSDoc and behavioral checks passed. Complete paired observations, per-process CPU attribution and dependency versions are retained in the workflow logs and `sco-batch-process-Linux` / `sco-batch-process-Windows` artifacts. The public facade SHA-256 on both OSes was `cb291da729382b15fecc4be136455ff7ee65645427702f6f902dca09c1d1c5ba`.

Run `node sims/sco-batch-fresh-process-cpu.js`. It creates an actual trusted HTTP service using `partitionScoAsyncModule({batch:true,maxBatchCalls:1024,serverOnlyInitialization:true})`, audits the original six-file private graph via `build()`, binds the original private ESM implementation, and attaches source SHA-256 manifest digests. The server authorizes public source/RPC reads and operations under an opaque token; a per-request aggregate cap admits at most 1,024,000 declared original engine iterations. A direct unauthenticated HTTP read of the public facade returns 403. The generated public source does not contain the protected engine.

The initial [workflow 44234520238](https://github.com/FlareZ123/obfs/actions/runs/44234520238) was **red** for both OSes after typechecks passed: my new test driver mistakenly validated inner batch entries using a source-level `name` property even though the generated facade remaps each entry to its actual `method` RPC ID. The server correctly denied the malformed outer request. Corrected the test handler to admit the exact compiler-generated `directMethod` in commit `7c6d38c`. This repair passed the two-platform run above; the red run is an invalid benchmark and must not be treated as candidate evidence.

## Method

A parent Node process initializes the same trusted server for both populations. Each paired observation starts a **new separate Node child process** with `execFile(process.execPath,...)`.

- **Native:** child loads the original private ESM application and host capability, runs 12,288 sequential `evaluateRemote(seed,count)` calls, and hashes length-prefixed JSON serialized results in input order.
- **Protected:** child authenticates an HTTP download of the actual generated public ESM source, compiles/imports that source as a `data:` ESM module, and makes 12 authenticated batches of 1,024 original operations against the parent trusted service. It hashes precisely the corresponding ordered JSON results.
- Each child reports **cumulative process CPU from creation**, which includes Node startup, JS module loading and its workload. The parent measures its own process CPU while the child runs. The experiment sums child and parent process CPU so that the protected side accounts for private server computation and client bootstrap. Wall elapsed is measured around the entire child lifetime in the parent.
- Nine **alternating-order** pairs were run per operating system and work size, with 1 and 1,000 private engine iterations per original call. Every pair matched the original result digest. Each batch contains real, sequentially authorized operations; there is no invented RPC payload or mocked server response.

The original private implementation runs in the native child but on the parent server for SCO. This matches the amount of original algorithm work and sums measured process CPU across both sides, while necessarily leaving runtime/JIT placement as a confounder. The HTTP service is local loopback with warmed trusted-server state, which is the declared SCO initialization exemption. Native and protected child startup are both included. The experiment does not attempt TLS, real browser CPU, distributed-machine accounting, or arbitrary raw JS semantic parity.

## Results

All 36 native and 36 protected child observations completed; every corresponding ordered JSON output digest matched. CPU values were positive on both runners, so no trial required a quantization exclusion.

| OS | Iterations per operation | Fresh-process combined CPU ratio of medians | CPU pairs strictly >2.5x | Fresh-process wall ratio of medians | Wall pairs strictly >2.5x |
| --- | ---: | ---: | ---: | ---: | ---: |
| Ubuntu Linux | 1 | **3.2011x** | **9/9** | 2.8450x | **9/9** |
| Ubuntu Linux | 1,000 | **1.9649x** | **0/9** | 1.6505x | 0/9 |
| Windows | 1 | **2.6129x** | **5/9** | 2.4783x | **4/9** |
| Windows | 1,000 | **1.9428x** | **0/9** | 1.6255x | 0/9 |

At 1,000 iterations, the paired-median diagnostic achieved confidence 0.98046875 and upper median ratio bounds 2.0008x Ubuntu / 2.1143x Windows, each below 2.5x. At 1 iteration, Ubuntu's median bound exceeded 2.5x, and Windows's median bound was `inconclusive`; the **five actual Windows strict CPU failures** independently veto this workload under the hard rule, regardless of the median diagnostic.

Representative median process CPU attribution: on Ubuntu, the protected one-iteration child used **270.488 ms** and the trusted parent **77.264 ms**; at 1,000 iterations the protected child used **268.541 ms** and parent **235.367 ms**. On Windows the respective protected child/server medians were **312/94 ms** at one iteration and **327/250 ms** at 1,000 iterations. These are independently taken component medians, so their sums need not equal the median of paired whole-process totals.

The same-core single-process fresh-ESM audit [workflow 44233280522](https://github.com/FlareZ123/obfs/actions/runs/44233280522), at a different commit, included authenticated facade download and unique module compilation but omitted Node process startup. It independently found 1,000-iteration 13-pair median CPU ratios of **1.4002x Ubuntu /1.9936x Windows** with no observed strict breaches, while the short workload exceeded the strict ceiling. The fresh-process experiment improves accounting scope and still retains the short-work veto. The two differently pinned designs are not a randomized causal comparison.

## Threat boundaries and statistical caution

This positive long-work sample demonstrates feasibility of one **explicitly selected**, fixed-size original 12,288-call JSON-wire workload with genuine server-only private implementation under a local authenticated batching API. It does not establish automatic batching equivalence. The original application's reflected own `undefined` field is omitted by JSON RPC, independently demonstrated by `test/sco-json-shape-contract.test.js`; raw JS object shape and identity are outside this measured API.

Even on the two zero-breach long-work populations, 0/9 observed strict failures yields only the conditional exact one-sided 95% upper future breach-probability bound **28.31% per population**, assuming independent representative trials. Simultaneous 95% two-OS Bonferroni bounds are **33.63% per OS**. Neither statistic establishes a hard 2.5x ceiling or security advantage.

The tested SCO threat model permits a credential-bearing client to relay original service responses to others, and no equal-trust ordinary minified RPC or independent attacker-cost control is included in this script. Authentication protects access to the trusted server, while unlimited legitimate calls remain a service policy challenge. No new anti-relay or anti-instrumentation guarantee follows from the batch speed.

**Verdict:** With client-process startup and whole participating Node-process CPU counted, the 1,000-iteration fixed workload stayed below 2.5x in the observed nine pairs on both OSes. The one-iteration workload **directly violated 2.5x** on both. Treat this as bounded architecture-feasibility evidence. Preserve the overall **RELEASE-BLOCKED** primary-objective verdict until real-browser client startup, distinct-principal contention, semantic-domain coverage and matched attacker/minifier comparisons are independently checked.
