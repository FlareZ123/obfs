# Source-pinned 2.5x total-process CPU pilot for a proved ESM owner field

22 November 2026. **Intermediate paired performance evidence** on one
three-module COO family, with a matched unbundled esbuild control. This
cannot establish the primary universal performance constraint.

## Executable method

At exact source c6f2d8a66400998f372429a8bd12ce37e816b0ad,
focused [Ubuntu/Windows run 45029440937](https://github.com/FlareZ123/obfs/actions/runs/45029440937)
completed both Node 22 jobs and project/external JSDoc.

The test at test/imported-key-total-cpu-profile.test.js builds a frozen
three-module ESM graph: one exported object containing two fields, an
immutable imported key, and a separately imported identity reader.
Actual closed-world COO compilation must rename a nonzero number of
fields (observed exactly **two**). An equal-trust, unbundled esbuild
minifier processes the same source files. All variants execute a
deterministic integer accumulation with 1, 10,000 and 2,000,000
iterations.

Each measured trial starts a *fresh* Node process, imports the full
ESM graph, executes the workload and captures process.resourceUsage()
userCPUTime+systemCPUTime from process start in microseconds. This
boundary includes COO startup and ESM load, as required for client-only
runtime accounting. Nine representative pairs per workload alternate
native/protected/minified launch order. Every observed output is
required to match native exactly.

The existing sims/familywise-budget-bound.js procedure separately
reports one-sided paired-ratio median inference, the actual observed
strict overbudget pair count and a finite-sample upper estimate of
the future strict breach frequency when no breach is observed.
Raw native/COO/minifier sample arrays and exact tool/runner versions
are retained in the source-pinned GitHub Actions job logs.

## Sampled results

| Runner / iterations | COO / native ratio of CPU medians | COO / esbuild ratio of CPU medians | Strict >2.5x paired breaches |
| --- | ---: | ---: | ---: |
| Ubuntu / 1 | 0.96417x | 0.97889x | 0/9 |
| Ubuntu / 10,000 | 0.99569x | 0.96914x | 0/9 |
| Ubuntu / 2,000,000 | 0.98995x | 1.06355x | 0/9 |
| Windows / 1 | 1.00000x | 1.03333x | 0/9 |
| Windows / 10,000 | 1.00000x | 1.03333x | 0/9 |
| Windows / 2,000,000 | 0.67391x | 1.00000x | 0/9 |

Across these explicitly tested six OS/workload populations, 0/54
observed paired ratios crossed 2.5x. The maximum observed paired ratio
was 1.17488x on Ubuntu and 1.53333x on Windows. Both OS-specific
three-workload Bonferroni diagnostics returned sample-supported with
a nominal 0.95 requested familywise coverage and attained lower bound
0.98828125 for the *median of paired-ratio populations*.

The separate exact zero-violation Clopper-Pearson familywise upper
frequency for each nine-pair workload was **0.3655058258** (about 36.6%).
This is deliberately weak evidence against any *universal* strict
per-run guarantee. Windows CPU counters had coarser recorded
granularity than Ubuntu; paired medians can misleadingly suggest
speedups, so no throughput improvement claim is made.

## Decision

This is a **bounded performance compatibility pass** for this one
selected property-renaming family, and paired evidence that the
transformed artifact did not introduce a large measured CPU premium
relative to a same-trust esbuild control. It does not apply to other
source files, arbitrary inputs, browser engines, SNO or SCO backends,
or the original selected arithmetic backend where strict budget
breaches are already documented. The
[same-family source-only recovery](imported-key-four-way-minified-control-2026-11-22.md)
still demonstrates 16/16 functional static clones in the scoped
positive-owner family, so CPU conformance alone cannot unblock the
strong-protection release.

The processor/service environment is shared CI, and ordinary
startup JIT variability, scheduler effects, timer granularity and
workload selection limit extrapolation. The strict observed pair
and statistical median verdict must remain separate.
