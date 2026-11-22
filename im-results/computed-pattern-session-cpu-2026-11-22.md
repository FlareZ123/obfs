# Actual computed-pattern rewrites: paired ESM process and hot-loop CPU

22 November 2026. **Intermediate performance admission evidence**, conditional on a precisely stated small multi-file program. This measures actual transformed output and an identical native program; it cannot establish a universal 2.5× compute guarantee or anti-cloning resistance.

## Program and measurement

`sims/computed-pattern-session-cpu-profile.js` compiles two closed-world Node ESM graphs with one immutable named owner `bag={secretField:41,bias:2}` and a late immutable string export `key="secretField"`. A direct consumer imports both values; a second variant imports the key via a separate ESM reexport module. Both access the owner's field using a computed object destructuring pattern inside a hot loop. The compiler rewrites **two private fields per graph** while preserving arithmetic output. It does not rename the exported `key` string.

Every original and compiled variant executes in a **separate fresh Node 22.23.4 process**, including startup, ESM loading, evaluation and output. Three loop counts were tested: 1, 100,000 and 1,000,000 iterations. Each count and graph has **nine alternating-order native/compiled pairs per operating system**. `process.cpuUsage()` reports total user+system process CPU as well as CPU accumulated during the hot loop, and a checksum must match exactly for every run. Repeated source-independent stdout/JSON parsing is included in process totals.

The full raw paired samples, including the unaggregated per-run CPU measurements and checksum, are preserved in [JSON data](computed-pattern-session-cpu-2026-11-22.json). Reproduce from the source-pinned [Ubuntu/Windows run 45045429746](https://github.com/FlareZ123/obfs/actions/runs/45045429746) at `1c5cab5efa49138dce1add057c8c5cbea25df763`. Both jobs passed, including strict project and external JSDoc.

## Process-wide user+system CPU results

Ratios are median compiled CPU divided by median original CPU, and are specific to each matching graph and loop count.

| Graph | Loop iterations | Ubuntu total CPU ratio | Windows total CPU ratio |
| --- | ---: | ---: | ---: |
| Direct same-producer key | 1 | 1.02549× | 1.00000× |
| Direct same-producer key | 100,000 | 0.96651× | 1.00000× |
| Direct same-producer key | 1,000,000 | 0.97732× | 1.00000× |
| Reexported immutable key | 1 | 1.01197× | 1.00000× |
| Reexported immutable key | 100,000 | 0.94513× | 0.67391× |
| Reexported immutable key | 1,000,000 | 0.93853× | 1.00000× |

**Zero observed paired total-process CPU ratios exceeded 2.5×.** The result is limited to these tested graphs and loop sizes.

Ubuntu hot-loop CPU median ratios for 100,000 and 1,000,000 iterations were respectively **0.89185× / 0.93641×** for the direct graph and **0.85428× / 0.88064×** for the reexported graph. Startup, loader and printing overhead dominate the one-event process CPU. Windows CPU readings in the recorded raw samples were heavily quantized, often at exactly 31,000 or 46,000 microseconds total, and short hot-loop samples could be zero. Consequently, the Windows hot-loop ratio is not suitable for a quantitative performance claim. The Windows 0.67391× total ratio is also not an accurate isolated transform-speed estimate.

## Scope

This is actual compiler output with positive rewrite coverage and independently checked application output, rather than a zero-rewrite placebo. It does not include browser execution, streaming network requests, full SCO RPC, SNO loader compromise, arbitrary JS frameworks, or adversarial tracing. These deterministic successful trials offer a **workload-specific performance feasibility signal** only.

The transformation proof is compile-time and the emitted repeated property access remains ordinary JavaScript. The strong-security release status stays **RELEASE-BLOCKED** until source-matched application-scale attacker-cost, arbitrary-source compatibility and strict performance evidence meet the repository's admission criteria.
