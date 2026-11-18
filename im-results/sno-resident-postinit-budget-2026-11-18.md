# SNO repeated-compute budget after server initialization (18 November 2026)

**Evidence type:** reproducible intermediate measurement, not a security result or universal performance certification.

**Latest strengthened CPU-time validation:** exact source `08eee5f05c24be503d561f4c8979a67e8092d598`, [two-platform complete run 44207391012](https://github.com/FlareZ123/obfs/actions/runs/44207391012), Node 22.23.4, **both jobs passed**, 13 pairs in each of eight workload/platform groups, zero observed strict >2.5x **CPU** or wall pairs. Extended samples and CPU-specific limitations are documented in the follow-up below.

**Historical wall-only validation:** Exact frozen code:** `00752173f6fe90ab53486753ab9b7d337db55573`. **CI:** [Linux and Windows complete run 44206254480](https://github.com/FlareZ123/obfs/actions/runs/44206254480), both jobs passed. Both used Node.js **22.23.4**. The preceding run 44206070870 failed at its new JSDoc preflight and has no valid runtime evidence; do not combine those source revisions.

## Motivation and boundary

The project requires SNO's actual repeated application computation to remain within 2.5x the native runtime. The user-defined SNO initialization exception permits setup performed once on the server to be amortized outside that repeated-compute budget. Existing `sims/polyvariant-app-sno.js --profile` uses **fresh Node process per pair** and includes startup, file hashing, CJS-to-ESM import and completion output. Those cold-session results remain meaningful for end-to-end startup latency and must not be silently reclassified as post-init compute.

The additional `sims/sno-resident-budget.js` runs the same three-module stateful fixture in **two persistent Node worker processes**, one native and one transformed. The transformed worker starts exclusively through the real SNO `sno-entry.cjs`, which SHA-256-verifies all four files before requiring the CommonJS entry. A source-pinned asset is replaced with `sims/sno-resident-entry.cjs` in both variants, and the protected manifest is regenerated from the actual bytes. The compiled graph has **three selected affine/polyvariant functions** and **one genuinely rewritten module**; the original graph has zero rewrites.

Both ESM import and the startup checksum run before the worker announces `READY`. Each message invokes the actual `runScenario` repeatedly with new session state, real integer arithmetic, Unicode records, JSON state snapshots, reflective state queries, and external `emit` callback counts. The timestamp is taken inside the child immediately before the repeated application calls and ends after the final return. Startup, IPC, input parsing, and output hashing fall outside this **symmetric** compute interval. Native and transformed processes get three identical warmups per workload and 13 alternating-order paired trials, with equal input, callback counts, and SHA-256 of returned application JSON checked for every pair. A separate negative test changes a protected math module and confirms the startup digest check rejects it **before READY**.

## 13 paired-trial results

The runtime ratio below is median protected duration divided by median original duration. The strict-pair maximum preserves the most adverse measured single protected/native ratio.

| Events per invocation | Invocations per paired sample | Ubuntu median ratio | Ubuntu maximum pair | Windows median ratio | Windows maximum pair |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 2,000 | 1.2199x | 2.1238x | 1.1061x | 1.6392x |
| 50 | 100 | 1.4302x | 1.5274x | 1.2859x | 1.3199x |
| 1,000 | 8 | 1.4329x | 1.5971x | 1.2379x | 1.3761x |
| 10,000 | 1 | 1.5885x | 1.6321x | 1.3318x | 1.9401x |

**Observation:** All eight measured workload/OS groups returned the existing one-sided paired-median `supported` diagnostic and **0/104** strict observed pairs over 2.5x. Both strict JSDoc, five-pair resident differential tests, and 13-pair measurement jobs passed. These are observations of this exact benchmark and runners; neither a process-specific worst-case bound nor a general JS runtime guarantee follows. The identical-input trial pairs share long-lived processes and may be correlated, so a sampling confidence interpretation requires additional representativeness and independence assumptions.

The warm result cannot cancel the reported **cold** SNO startup overhead, whose separate operational cost may matter for short-lived CLI applications. Conversely, a high cold-start ratio alone cannot establish violation of the user-specified SNO repeated-compute ceiling.

## Security and release implication

This benchmark changes **performance attribution**, not the security posture. A filesystem owner can replace the launcher or graph and bypass its public digest manifest. The existing independent source-only reconstruction and runtime-hook attacks remain successful in their scoped trials. No full-control source secrecy, unauthorized-modification resistance, or authorized-environment binding is demonstrated.

The cross-mode release remains blocked on those attack results and the other modes' performance observations. Before treating any SNO 2.5x result as a post-initialization release gate, preserve both a repeated-compute profile and a separate cold-start latency profile with explicit boundaries. Existing `sims/release-evidence-gate.js` profiles SNO via fresh subprocesses and should be labeled **cold end-to-end latency**, rather than silently substituting it for repeated compute.

## Reproduce

From the pinned tree on Node.js 22, install dependencies and run:

```powershell
npm install --no-package-lock --ignore-scripts
npx tsc -p jsconfig.sno-resident.json
node --test test/sno-resident-budget.test.js
node sims/sno-resident-budget.js 13
```

The output marker `SNO_RESIDENT_BUDGET` includes native and protected millisecond arrays, paired-median bounds, per-workload strict-pair counts, Node version, and platform. The immutable workflow logs contain the full raw output for both OSes. A separate manual workflow `.github/workflows/manual-sno-resident-budget.yml` is available for replay.

## Follow-up: amplified process CPU time, 18 November 2026 00:24 UTC

The first added `process.cpuUsage()` diagnostic was deliberately not promoted to a result. At source `a3675445f7ed2765318bffee34cd2f93efdfe7a3`, [run 44207194506](https://github.com/FlareZ123/obfs/actions/runs/44207194506) showed two strict Ubuntu CPU-only outliers for short 1-event samples (native process CPU near 1.5 ms), while Windows returned a zero CPU duration and correctly failed the positive-duration test before releasing data. These are timer-resolution and microbatch-stability problems, not validated evidence of a 2.5x repeated-compute violation.

The corrected `sims/sno-resident-budget.js` prolongs actual `runScenario` calls per sample, preserves the same three transformed functions and runtime environment, and measures both monotonic wall time and the process CPU usage around identical synchronous work. The [exact-source Ubuntu and Windows run 44207391012](https://github.com/FlareZ123/obfs/actions/runs/44207391012) at `08eee5f05c24be503d561f4c8979a67e8092d598` passed strict JSDoc, the genuine digest-negative and five-pair real-work tests, and all four 13-pair workloads. The CPU time has millisecond resolution on Windows, so sample durations were deliberately increased into tens of milliseconds or longer.

| Events × calls per sample | Ubuntu CPU median ratio | Ubuntu maximum CPU pair | Windows CPU median ratio | Windows maximum CPU pair |
| --- | ---: | ---: | ---: | ---: |
| 1 × 50,000 | 1.2174x | 1.2611x | 1.1596x | 1.4103x |
| 50 × 2,500 | 1.4603x | 2.2305x | 1.2844x | 1.2936x |
| 1,000 × 80 | 1.4755x | 1.5134x | 1.3974x | 1.6154x |
| 10,000 × 5 | 1.5775x | 1.6042x | 1.6596x | 2.2708x |

**Observed CPU result:** **0/104** strict >2.5x paired CPU observations across eight OS/workload groups; every one-sided paired-median CPU diagnostic returned `supported`. The corresponding internal worker elapsed-wall result also had zero strict breaches, with Ubuntu wall median ratios 1.2162/1.4614/1.4821/1.6046 and Windows 1.1371/1.2621/1.3372/1.4098. This is a materially more suitable *compute*-time sample than the earlier millisecond-scale CPU attempt, with persistent limitations from shared-process JIT history, GC, measurement granularity, correlated repeated inputs, finite trial count and lack of adversarial authorization.

**Decision:** retain the two exact-source runs separately. The old wall-only run is reproducible historical context, the failed short CPU run is negative methodological evidence, and the latest amplified CPU+wall run is the strongest current SNO post-init performance evidence. None cancels the demonstrated full-control SNO clone or upgrades the overall release from blocked.
