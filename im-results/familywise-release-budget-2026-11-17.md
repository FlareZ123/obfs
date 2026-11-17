# Simultaneous performance-budget evidence for COO/SCO release gate

**Date:** 2026-11-17. **Classification:** Intermediate measurement-method improvement, not an obfuscation-strength result. **Author:** Agent 17.

## Why this change was needed

The release summary uses 95% one-sided order-statistic intervals for each of four COO application loads and two SCO RPC loads. A collection of individually 95%-confident judgements has no automatic 95% *simultaneous* coverage when a release decision considers them together. The existing intervals remain informative for each workload and should not be presented as a joint bound.

## Implemented control

The new standalone [familywise statistic](../sims/familywise-budget-bound.js) reuses the actual [paired median diagnostic](../sims/paired-budget-bound.js), allocating the requested total noncoverage probability equally across both tails of all selected workloads. With **six** COO/SCO populations and requested 95% simultaneous confidence, each marginal tail requests `1 - 0.05/(2*6) = 0.9958333333` confidence. For nine independent paired observations within a workload, the maximum and minimum observed paired ratios bound the population median with one-sided **511/512 = 99.8046875%** coverage per side under the current continuous-observation model. Bonferroni's union bound gives at least **97.65625%** simultaneous coverage across all twelve sides. This construction requires no independence *between* distinct workloads. It still assumes independent, representative observations *within* each workload, which CI resource drift cannot guarantee.

The release [summary](../sims/release-evidence-gate.js) now emits an explicit `performance.crossModeFamilywise` section containing the six workload labels, adjusted bounds, requested and attained lower-bound confidence, and three-way verdict. The original marginal 95% per-workload evidence remains intact. Source-only functional cloning and security-axis verdicts remain unchanged. The available SNO data on main carry only separate medians, so they are **excluded** from the simultaneous calculation rather than being assigned fabricated paired intervals.

An independent work-in-progress [SNO PR #53](https://github.com/FlareZ123/obfs/pull/53) would preserve actual paired process timings for four SNO loads. An eventual post-merge release gate should recalculate the Bonferroni allocation over ten COO/SNO/SCO workloads and document the different process/session boundaries; the present control is expressly **six-population**, not full cross-mode budget certification.

## Reproduction, assumptions and limits

The [release test](../test/release-evidence-gate.test.js) checks six-interval familywise allocation, both-tail exceeded/supported/inconclusive decisions, and rejection when the available sample count cannot meet the requested confidence. The [existing manual Linux/Windows full release evidence workflow](../.github/workflows/manual-release-evidence.yml) was dispatched at exact source `20ea035e8a6fe2957207175e61754d92861227d6`: [run 44031471608](https://github.com/FlareZ123/obfs/actions/runs/44031471608). The run was **queued** at report creation; no green conclusion is claimed here.

The statistic concerns medians of *paired runtime ratios*, not a strict worst-case 2.5× limit, medians of separate groups, universally valid JIT states, or the maximum possible execution cost. The report deliberately keeps the overall security release verdict **RELEASE-BLOCKED**. More samples, stable workload design, real browser cold startup, network transport, a conventional minifier control and independent static/dynamic attacks remain necessary for the project's stronger objectives.
