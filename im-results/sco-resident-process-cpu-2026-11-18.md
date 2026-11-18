# SCO initialized, authenticated whole-process CPU and wall cost (18 November 2026)

**Status:** bounded negative performance evidence; supports a conditional workload-selection rule, not a strong-obfuscation result or a universal overhead theorem.

## Reproduction and trusted boundary

The opt-in `sims/sco-resident-cpu.js` starts the actual trusted Node service in `examples/application-challenge/sco-server.cjs`, imports the checked-in compiler-generated public RPC facade `examples/application-challenge/sco-public/sco-before/api.mjs`, and invokes the native server-resident `evaluateRemote` implementation and its authenticated JSON/HTTP facade in one Node process. The facade sends the correct bearer token to the live local listener. The original five private ESM modules are not moved to the client.

**Exact source:** `4e29a1cbc719bebe492a9cf1866b27e855bbf70a`. [Successful two-platform manual workflow 44219203239](https://github.com/FlareZ123/obfs/actions/runs/44219203239), Node `v22.23.4`, Ubuntu and Windows, including strict external JSDoc. The workflow is explicit opt-in, not automatic per-commit CI.

Each row exercises three distinct seed values with the same `count`, repeated 64 times, for 192 direct native calls and 192 authenticated remote calls **per trial**. There are three alternating-order warmups, then 13 paired observations. Initialization of both private graph and facade, authentication token generation, Node boot and import happen before either side's measured intervals. Every trial compares outputs across the **JSON wire-value contract** and fails if they differ. The wall clock is `performance.now()`; the CPU clock is `process.cpuUsage()`, measuring process user+system CPU (the loopback client and server share a process). The original/private server remains initialized and retains full authorization checks. Node's CPU clock reports microsecond units but actual runner resolution varies; zero durations are reported as unresolved pairs rather than assigned infinite/synthetic slowdown.

| Original engine iterations **per call** | Calls per trial | Ubuntu CPU protected/native ratio of medians | Ubuntu strict CPU pairs >2.5x | Windows CPU protected/native ratio of medians | Windows resolved strict CPU pairs / unresolved | Ubuntu/Windows wall ratio of medians |
| ---: | ---: | ---: | ---: | --- | --- | ---: |
| 1 | 192 | **456.00x** | **13/13** | unavailable (native CPU zero in all pairs) | **0 / 13** | **365.01x / 445.11x** |
| 1,000 | 192 | **29.42x** | **13/13** | unavailable (10 native zero pairs) | **2 / 10** | **25.65x / 35.66x** |
| 120,000 | 192 | **1.172x** | **0/13** | **1.300x** | **0 / 0** | **1.139x / 1.233x** |

Across all three workload groups, Ubuntu had **26/39 strict CPU breaches**, zero unresolved CPU pairs and 26/39 wall breaches. Windows had **2 strict CPU breaches among 16 resolved pairs**, 23 unresolved CPU pairs and **26/39 wall breaches**. The two sustained 120,000-iteration CPU populations received one-sided median decisions `supported` on both platforms and zero observed strict breaches among their 26 paired observations. Both 1-iteration and 1,000-iteration Ubuntu CPU medians were `exceeded`. All six wall population decisions matched the corresponding strict wall-breach pattern.

## Behavior and evidentiary limitations

The underlying private application returns a nested field `{value:undefined}` for an absent reflected key. The native raw object retains that own property, but `JSON.stringify` drops it and the browser/Node RPC facade uses `response.json()`. An initial prototype of this benchmark incorrectly asserted raw-object deep equality and failed on Ubuntu; it was repaired to compare `JSON.stringify` outputs on the contract the real public JSON RPC exposes. **Raw JavaScript object-shape identity is not preserved by the existing SCO JSON-only API.** This is a material compatibility scope limitation under the project's broader 1:1 requirement and must be evaluated separately for code that observes `Reflect.ownKeys`, `Object.hasOwn`, descriptors, or absent-vs-own-undefined. It is not evidence of an auth bypass or server-source leak.

The first Windows prototype also asserted `cpuMs>0` on every small interval and failed because process CPU accounting was exactly zero. The audited implementation treats such trials as unresolved and returns null CPU statistical bounds when any of a population's pairs are unresolved. It does not silently drop those pairs or claim a zero CPU-budget breach.

This test measures **whole-process CPU**, including transport serialization and all server work, and localhost *elapsed* time. It does not separately establish trusted server CPU, remote client CPU, WAN latency, TLS cost, sustained multi-account contention, an exact worst-case 2.5x bound or resistance to same-token online relay. It uses a single original private application, one pair of runners and 13 samples per group. In contrast, the older cross-mode `sims/application-challenge-sco-cold-session.js` measures fresh Node client startup, and the SNO resident work uses a distinct manifest-checked source and CPU boundary; the figures must not be silently combined into one familywise population.

## Decision

Authenticated SCO relocation can amortize its transport cost on this high-compute application: the measured 120,000-iteration workload has supported median and zero strict observed CPU breaches. The same deployed facade is tens to hundreds of times costlier for tiny repeated operations, so a declaration that **all** SCO workloads satisfy the 2.5x compute budget is contradicted by these samples. Preserve the JSON-value contract limitation and unresolved Windows CPU count. No inference about universal adversarial confidentiality or tamper resistance follows from these performance observations.

Related evidence: `im-results/application-challenge-sco-source-relay-2026-11-16.md` for the legitimate online public-facade relay; `im-results/sno-hot-leaf-crossmode-reconciliation-2026-11-18.md` for the separate SNO selected-hot attribution. The raw CPU and wall arrays are printed verbatim in the source-pinned Actions job logs under `SCO_RESIDENT_CPU`.
