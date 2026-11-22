# Three-mode private factory/destructuring: paired Node CPU and minifier control

**22 November 2026. Author: Agent 16. Classification: intermediate,
workload-specific performance and behavior evidence.** This benchmark is
not a general obfuscation-security result and does not establish a universal
2.5× compute guarantee.

## Reproducer and validation boundary

[The runnable profile](../sims/factory-destructuring-paired-session.js)
generates two ES modules: an exported owner returned by a unique private
zero-argument factory, and an imported worker performing a discarded
destructuring assignment with a default side-effect counter followed by a
second private own-field read. In each `coo`, `sno` and `sco` compiler
configuration, closed-world proof rewrote **two own keys**, while the source's
checksum and zero default-call count matched the original in separate native
Node ESM processes. This benchmark invokes emitted ESM files directly as
JavaScript. It does not exercise an actual SCO network RPC facade or SNO
integrity launcher.

The benchmark compares exact original graph, actual compiler-emitted graph,
ordinary per-module `esbuild.transformSync({minify:true})` output under the
same module trust boundary, and byte-identical original-vs-original placebo.
All variants execute the same 11-million-iteration checksum plus five
100,000-iteration warmups. Each arm has **eight alternating-order,
fresh-process native/candidate pairs per mode**, so each operating system
records 72 pairs across three modes and three arms. Source graph bytes:
**743 native, 769 emitted, 518 esbuild-minified** per mode.

The child reports a process CPU counter inside the selected worker plus
process-lifetime CPU. No compiler build time is charged. Each pair preserves
both raw counters and both ratios. Strict per-pair values over 2.5× are
reported without replacing them with a favorable median, and a same-code
placebo estimates the clock/scheduling noise for the identical workload.
This test does not include browser CPU, remote network I/O or application
deployment and cannot justify any general initialization deduction.

The pre-existing
[manual assignment performance workflow](../.github/workflows/manual-assignment-performance.yml)
ran the profile and both strict JSDoc checks on Node **22.23.5**. The
[source-pinned 45033513184 run](https://github.com/FlareZ123/obfs/actions/runs/45033513184)
passed on Ubuntu and Windows at exact SHA
`7a72dc84e9372ba8c6e4c0a6d96217d51515d84a`. Full eight-pair
raw counter arrays are retained as the JSON
`FACTORY_DESTRUCTURING_PAIRED` line in each job log.

## Measured selected-work CPU

Values are ratios of candidate/native CPU in the selected 11M-iteration
worker, with strict breaches counted per eight independently paired
measurements. The ordinary minifier and unchanged-source placebo are
shown explicitly.

| OS | Mode | Emitted median / worst | Esbuild median / worst | Placebo median / worst | Strict hot breaches |
| --- | --- | ---: | ---: | ---: | --- |
| Ubuntu | COO | 0.99837 / 1.01882× | 1.00211 / 1.01257× | 1.00154 / 1.00926× | 0/24 |
| Ubuntu | SNO | 0.99951 / 1.00787× | 1.00374 / 1.02799× | 1.00249 / 1.01072× | 0/24 |
| Ubuntu | SCO | 0.99893 / 1.00729× | 1.00047 / 1.00995× | 1.00198 / 1.01011× | 0/24 |
| Windows | COO | 0.96875 / 1.06667× | 1.00000 / 2.06667× | 1.03334 / 1.93750× | 0/24 |
| Windows | SNO | 1.00000 / 1.06667× | 1.00000 / 1.93750× | 1.00000 / 1.06667× | 0/24 |
| Windows | SCO | 1.00000 / 1.06667× | 1.06667 / 1.06667× | 1.06667 / 1.93750× | 0/24 |

Each "0/24" counts all three arms within one operating-system/mode row
(eight pairs per arm). Windows hot measurements are visibly quantized:
small integer multiples of its CPU sampling interval produce ratios
such as 1.06667× and 1.93750×. Their numerical precision is lower
than the displayed five decimal digits.

## Process-lifetime CPU counter and strict threshold

| OS | Mode | Emitted median / worst | Esbuild median / worst | Placebo median / worst | Strict session breaches, emitted / esbuild / placebo |
| --- | --- | ---: | ---: | ---: | --- |
| Ubuntu | COO | 1.00272 / 1.04785× | 1.00412 / 1.01682× | 1.00932 / 1.06499× | 0 / 0 / 0 |
| Ubuntu | SNO | 1.01928 / 1.07430× | 0.99210 / 1.03842× | 1.01159 / 1.09714× | 0 / 0 / 0 |
| Ubuntu | SCO | 1.00835 / 1.09602× | 0.99016 / 1.03150× | 0.98040 / 1.05020× | 0 / 0 / 0 |
| Windows | COO | 0.90260 / 1.34783× | 1.00000 / **3.00000×** | 1.00000 / 1.48387× | 0 / **1** / 0 |
| Windows | SNO | 1.00000 / 1.67391× | 1.00000 / 1.32609× | 1.17392 / 1.48387× | 0 / 0 / 0 |
| Windows | SCO | 1.00000 / 1.53333× | 1.00000 / 2.06667× | 1.00000 / 1.67391× | 0 / 0 / 0 |

The one observed Windows minifier-control COO process-lifetime breach was
**93,000 μs candidate vs 31,000 μs native (3.00000×)**. It is preserved
as a strict diagnostic veto for that measured pair despite both implementations
having identical observable results. The same Windows mode's minified
selected-work hot ratio stayed at or below 2.06667×. No measured emitted
COO/SNO/SCO pair exceeded 2.5× in this finite test on either OS. The
sample does not eliminate startup noise or establish a bound on new workloads.

## Security and decision

The prior three-mode composition
[semantic/Chromium report](factory-destructuring-three-mode-composition-2026-11-22.md)
already demonstrated a seedless offline normalizer recovering both published
generated property labels from the emitted COO source. The paired performance
result therefore supports a **narrow low-overhead execution fact**, with
no observed source-reconstruction or runtime-tamper advantage over an ordinary
same-trust minifier. COO/SNO full-control threats and SCO online-oracle
limits persist. The project's primary **RELEASE-BLOCKED** decision is unchanged.
