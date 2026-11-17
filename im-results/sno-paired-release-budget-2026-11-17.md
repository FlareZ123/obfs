# Distribution-aware SNO full-process release budget

**Date:** 2026-11-17. **Classification:** Intermediate statistical control, awaiting Linux/Windows validation at exact commit.

## Measurement deficiency

The cross-mode release decision originally preserved honest paired COO and SCO CPU samples and their one-sided median bounds, but discarded raw SNO timings after computing the ratio of separate medians. The SNO mode was permanently labelled sample-inconclusive even when thirteen alternating-order pairs of full child-process measurements had been taken. That label communicated uncertainty without retaining enough information to reproduce its magnitude or compare SNO consistently to the stipulated 2.5x budget.

## Bounded remedy

The [existing SNO profile](../sims/polyvariant-app-sno.js) already executes identical event records in independent native and SNO Node child processes, alternating per-pair order, validating the complete application output each time, and computing thirteen median observations per workload. This branch retains the **ordered raw native/SNO timing arrays** and invokes the same [distribution-free paired median bound](../sims/paired-budget-bound.js) already used for COO and SCO.

Each row now reports input event count, median native and SNO process duration, ratio of separate medians, thirteen raw timing pairs, median of within-pair ratios, one-sided lower and upper order-statistic bounds, confidence coverage, and the three-way verdict supported / exceeded / inconclusive. The [cross-mode release gate](../sims/release-evidence-gate.js) propagates these values to its SNO performance section rather than substituting a permanent not-computed marker. The existing application source, compiled SNO entry point, integrity manifest and behavior checks are unchanged.

The paired order-statistic calculation assumes independent, identically distributed samples. Per-pair rotation reduces first-run order bias but cannot prove independence under CPU temperature, cache drift or noisy shared CI runners. With thirteen pairs, the one-sided 95% bound uses the 10th-lowest paired ratio (95.3857% coverage), permitting three higher outliers before the upper bound. It may still be inconclusive despite a low ratio of separate medians. Samples include Node process creation, SNO manifest validation, ES module load, actual application work, result serialization and output; they exclude one-time output materialization and deployment/network overhead. No measured platform can prove a universal 2.5x threshold.

## Reproduction

The branch updates [profile](../sims/polyvariant-app-sno.js), [release summary](../sims/release-evidence-gate.js), and [release-gate regression](../test/release-evidence-gate.test.js). The existing [manual cross-mode validation](../.github/workflows/manual-release-evidence.yml) checks the authentic COO/SNO/SCO applications on Node 22 Ubuntu and Windows and uploads exact audit samples. The [external strict JSDoc check](../jsconfig.external.json) includes both modified research sources.

Until the pinned two-platform gate completes, the new SNO confidence and budget verdict must not be reported as validated. Even a green gate would leave the overall hostile-runtime **RELEASE-BLOCKED** conclusion unchanged: current selected COO/SNO functions are publicly reconstructible and authenticated SCO services remain relievable through legitimate credentials.


## Completed cross-platform evidence, 2026-11-17 06:27 UTC

[Manual validation run 44030971984](https://github.com/FlareZ123/obfs/actions/runs/44030971984) passed both Ubuntu and Windows Node 22 with external strict JSDoc, release-decision semantics tests and real multi-mode compatibility/attack executions at **exact executable SHA d0c8a28481ad55fb9340c7046cc9017bfc8abba6**. Full raw 13-pair arrays and five-axis attack summary are retained as Linux/Windows workflow artifacts. The audit remained RELEASE-BLOCKED because source-only COO/SNO reconstruction and authenticated SCO replay remain reproducible, independently of the SNO CPU verdict.

| SNO full-process event count | Ubuntu ratio of medians | Ubuntu 95% one-sided upper paired-ratio bound | Windows ratio of medians | Windows upper bound |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 1.0675 | 1.1327 | 1.0859 | 1.1309 |
| 50 | 1.1454 | 1.1602 | 1.1015 | 1.1225 |
| 1,000 | 1.1610 | 1.1687 | 1.1223 | 1.1318 |
| 10,000 | 1.0973 | 1.1149 | 1.0922 | 1.1008 |

Both operating systems therefore returned **sample-supported** median paired slowdown below 2.5x across these **eight selected process workloads**, with 13 pairs each and one-sided binomial coverage 0.953857421875. The reported point estimate is a ratio of sample medians, while the upper bound constrains the sample-distribution median of within-pair ratios under the i.i.d. continuous-sample model. These are different estimands. Neither bounds individual worst-case latency or arbitrary applications.

The same gate measured SCO one-event fresh-client ratios **4.2457 Ubuntu / 2.9803 Windows**, both statistically **sample-exceeded** above 2.5x; SCO 120,000-event ratios **2.3586 Ubuntu / 2.0374 Windows**, both **sample-supported**. COO full-graph Node session checks were sample-supported below 2.5x on the four selected event loads, but published COO protected leaves were still statically reconstructed. This supports maintaining the release block rather than collapsing mode-specific evidence into a global performance pass.


## Current-main simultaneous-familywise integration, pending rerun

After the preceding two-platform SNO-only evidence gate, Agent 17 independently added a 95% **simultaneous familywise** median budget diagnostic for four COO and two SCO workloads on main. This changed both release-evidence source and its tests, resulting in a merge conflict for the original SNO-only draft [PR 53](https://github.com/FlareZ123/obfs/pull/53). A follow-on branch based on current main retains that six-workload implementation and adds the **four now-available paired SNO populations**, yielding ten marginal workload populations within one Bonferroni-corrected simultaneous comparison. Each row allocates tail risk 0.05/(2 * 10) = 0.0025. The 13 SNO samples allow an order-statistic upper bound using the 12th-lowest ratio at marginal coverage 0.998291015625, while the six nine-pair COO/SCO controls use the maximum sample at 0.998046875 coverage. The conservative joint lower coverage is at least 0.962890625 under the documented within-workload i.i.d. assumptions.

The per-mode one-sided 95% SNO bounds and the joint 95% familywise confidence statement are now reported **separately**. A joint assessment with ten workloads may be more conservative than the prior six-workload decision; universal timing and security guarantees remain unavailable. The older [pinned green run 44030971984](https://github.com/FlareZ123/obfs/actions/runs/44030971984) certifies only the original SNO-per-mode control, not this new familywise merge. Before adoption, verify all ten simulated families in Node regression and real COO/SNO/SCO profiles across Ubuntu and Windows with exact source commit and saved raw timing rows.
