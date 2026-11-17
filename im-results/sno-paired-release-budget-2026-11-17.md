# Distribution-aware SNO full-process release budget

**Date:** 2026-11-17. **Classification:** Intermediate statistical control, awaiting Linux/Windows validation at exact commit.

## Measurement deficiency

The cross-mode release decision originally preserved honest paired COO and SCO CPU samples and their one-sided median bounds, but discarded raw SNO timings after computing the ratio of separate medians. The SNO mode was permanently labelled sample-inconclusive even when seven alternating-order pairs of full child-process measurements had been taken. That label communicated uncertainty without retaining enough information to reproduce its magnitude or compare SNO consistently to the stipulated 2.5x budget.

## Bounded remedy

The [existing SNO profile](../sims/polyvariant-app-sno.js) already executes identical event records in independent native and SNO Node child processes, alternating per-pair order, validating the complete application output each time, and computing seven median observations per workload. This branch retains the **ordered raw native/SNO timing arrays** and invokes the same [distribution-free paired median bound](../sims/paired-budget-bound.js) already used for COO and SCO.

Each row now reports input event count, median native and SNO process duration, ratio of separate medians, seven raw timing pairs, median of within-pair ratios, one-sided lower and upper order-statistic bounds, confidence coverage, and the three-way verdict supported / exceeded / inconclusive. The [cross-mode release gate](../sims/release-evidence-gate.js) propagates these values to its SNO performance section rather than substituting a permanent not-computed marker. The existing application source, compiled SNO entry point, integrity manifest and behavior checks are unchanged.

The paired order-statistic calculation assumes independent, identically distributed samples. Per-pair rotation reduces first-run order bias but cannot prove independence under CPU temperature, cache drift or noisy shared CI runners. With seven pairs, the 95% one-sided bound uses an extreme order statistic and can be inconclusive despite a low observed ratio of medians. Samples include Node process creation, SNO manifest validation, ES module load, actual application work, result serialization and output; they exclude one-time output materialization and deployment/network overhead. No measured platform can prove a universal 2.5x threshold.

## Reproduction

The branch updates [profile](../sims/polyvariant-app-sno.js), [release summary](../sims/release-evidence-gate.js), and [release-gate regression](../test/release-evidence-gate.test.js). The existing [manual cross-mode validation](../.github/workflows/manual-release-evidence.yml) checks the authentic COO/SNO/SCO applications on Node 22 Ubuntu and Windows and uploads exact audit samples. The [external strict JSDoc check](../jsconfig.external.json) includes both modified research sources.

Until the pinned two-platform gate completes, the new SNO confidence and budget verdict must not be reported as validated. Even a green gate would leave the overall hostile-runtime **RELEASE-BLOCKED** conclusion unchanged: current selected COO/SNO functions are publicly reconstructible and authenticated SCO services remain relievable through legitimate credentials.
