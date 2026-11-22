# Source-exact held-out rotated core: warmed CPU budget violation on Linux and Windows

**Date:** 22 November 2026. **Agent:** 38. **Classification:** intermediate, source-pinned performance veto for this published-source family. The original 2.5x compute budget applies to selected protected work; this report measures that boundary.

## What was compared

The four held-out source strings at frozen deterministic indices `0,9,18,27` (rotations `9,15,31,15`) were selected before seeing performance measurements from the same [post-freeze source corpus](a2mba-rotated-core-int32-feasibility-2026-11-19.md). Each exact published protected function was compared against:

- The exact native 32-bit arithmetic expression recovered by the **frozen source-only normalizer** (`2c478bb5e9418cc6ba0c59ef5d963a9cc3cb9614`).
- The same recovered native expression minified with declared `esbuild@0.28.2` using `transformSync`, `minify:true`, `target:'es2022'`, and `format:'esm'`.

All three function versions execute in independent `node:vm` realms with *identical workload loops*. The hot loop captures its kernel function **once before entering the timed loop**, avoiding per-operation cross-realm function calls or global property lookup. Every workload checksum is compared between the three lanes before and during trials.

The exact fixed workload updates a 32-bit state via `Math.imul`, calls the four-input function with deterministic varying Int32 arguments, and accumulates a signed Int32 checksum. Each lane receives four untimed warmup passes of 200,000 calls, followed by **7 rotating-order paired trials of 2,000,000 calls**. The timer is `process.cpuUsage` (user+system microseconds) around the loop; it excludes VM setup, source generation, attacker execution, and minification. These costs must be accounted for separately in any full-session deployment. The native and protected CPU are measured on exactly matched inputs.

## Cross-platform results

**Immutable workflow:** [attacker-normalizer run 45062436784](https://github.com/FlareZ123/obfs/actions/runs/45062436784), source SHA `ccaa1d76da9c9ba06d563233cef232c0665ad0b5`. Both Ubuntu and Windows Node **v22.23.5** jobs completed **successfully**. Here a green workflow means that profiling and behavior checks executed correctly; the **performance policy failed** on the reported data.

| Fixed source case (index / rotation) | Ubuntu protected/native median ratio | Ubuntu protected/minified median ratio | Windows protected/native median ratio | Windows protected/minified median ratio |
| --- | ---: | ---: | ---: | ---: |
| 0 / 9 | **3.176x** | **3.166x** | **3.001x** | **3.001x** |
| 9 / 15 | **3.230x** | **3.244x** | **3.000x** | **3.000x** |
| 18 / 31 | **3.225x** | **3.218x** | **3.001x** | **3.001x** |
| 27 / 15 | **3.140x** | **3.155x** | **3.023x** | **3.023x** |

For **each** case on **each** operating system, all **7/7** individually paired protected/native ratios exceeded the 2.5x ceiling. The same is true for the protected/minified-native ratios. Across both operating systems and the four cases: **56/56 protected/native pair breaches** and **56/56 protected/minified-native pair breaches**.

Typical 2,000,000-call median CPU times were around **0.72 s native and 2.28–2.35 s protected** on Ubuntu, and **0.70 s native and 2.11–2.13 s protected** on Windows. Windows reports quantized microseconds in this environment; the large excess over the ceiling is consistent across all seven pairs. Exact unrounded medians, all 168 raw CPU measurements (84 per OS), pair maxima, source SHA-256 hashes, and workload metadata are preserved in [the raw cross-platform dataset](a2mba-heldout-source-paired-cpu-raw-2026-11-22.json). The executable reproducer is `sims/a2mba-heldout-source-paired-cpu.js`.

The earlier oversized preliminary run [45062082287](https://github.com/FlareZ123/obfs/actions/runs/45062082287) was **cancelled intentionally** before results because a local duration preflight showed that 20 million calls per lane would risk exceeding its 10-minute CI timeout. The final recorded gate above uses the calibrated 2 million-call workload. Do not interpret the cancelled run as an independent performance result.

## Interpretation and decision

**Reject the exact held-out helper-based rotated-core source family for the sampled 2.5x warmed compute budget.** It fails both original-native and conventional minifier comparisons by a substantial margin on both environments. The separate [source-coincident frozen attacker/rank screen](a2mba-rotated-core-affine-rank-screen-2026-11-22.md) also demonstrates 32/32 static source reconstructions even though each protected function has maximal 32-dimensional nonlinear residual output rank.

This does **not** contradict the earlier, distinct hand-coded closure-based rotated-core prototype's sampled cost screen. The generated held-out four-function source, its public helper call boundaries, and the frozen benchmark's exact native comparator are different program artifacts; no claim about all closure/lowering implementations follows. Likewise the measured steady-state CPU workload does not independently establish total startup latency, browser performance, cold-session cost, tamper resistance, authorization, or any per-SCO/COO/SNO release qualification.

To qualify another candidate, first freeze the **actual emitted runtime bytes**, run the same-source static/dynamic attacks and exact end-to-end contract differential, then apply paired 2.5x CPU gates against the original and a same-trust minifier control. Avoid promoting good results for a prototype with different generated code paths into evidence for the emitted candidate.

## Reproduction

```text
node sims/a2mba-heldout-source-paired-cpu.js
node --test test/a2mba-rank-attacker-coincident.test.js
```

The Node version, runner performance, JIT state, and OS affect the raw numbers. The frozen source hashes and exact methodology enable subsequent matched re-runs. Interpret this report as a reproducible candidate-specific **runtime veto**, not a universal asymptotic lower bound.
