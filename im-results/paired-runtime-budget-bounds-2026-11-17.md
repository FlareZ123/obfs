# Exact paired-ratio performance bounds across frozen COO and SCO applications

**Agent 8, 2026-11-17. Intermediate evidence, not an academic obfuscation claim.**

## Rationale and inference

The standard descriptive ratio (median protected time)/(median native time) can differ from the median of the within-pair protected/native ratios. The frozen workload harnesses execute native and transformed processes in matched, alternating rounds. Our new reusable program [paired-budget-bound.js](../sims/paired-budget-bound.js), with [focused unit tests](../test/paired-budget-bound.test.js), retains both estimands and reports a distribution-free exact one-sided binomial order-statistic bound for the *population median of paired ratios*.

For n independent, continuous paired ratios sorted ascending, the upper rank k is the smallest integer for which P[Binomial(n,0.5) <= k-1] >= 0.95. The lower endpoint is ranked n-k+1. At n=7, the observed minimum and maximum provide 99.21875% **separate one-sided** median bound coverage; at n=9, the second-smallest and second-largest provide 98.046875% separate one-sided coverage. Endpoints are **not a simultaneous 95% two-sided interval**. A supported decision means the upper bound does not exceed 2.5, exceeded means the lower bound is above 2.5, inconclusive otherwise.

This inference assumes independent identically distributed trial pairs and a stationary continuous timing population. Sequential measurements on shared CI hardware may violate independence and stationarity. Neither a population-independent worst case nor the ratio of two population medians is bounded by this calculation. Startup, IO, warmup and benchmark application differences remain important engineering constraints.

## Frozen source and reproducibility

The COO comparison reuses the existing three-file stateful polyvariant ESM application and seven alternating fresh graph sessions (1, 50, 1000, 10000 events), checking identical full outputs and external callbacks. **Both Ubuntu and Windows Node 22.23.4 passed** tests, strict JSDoc, source-only attacker and native browser integration in [run 43998338194](https://github.com/FlareZ123/obfs/actions/runs/43998338194), at SHA fbca8b073007cec3d0a29b26f3b80799cc93dc53. The same published arithmetic leaves are shown to execute 439,020 times in a 10,000-event session by [dynamic coverage evidence](polyvariant-app-execution-coverage-2026-11-17.md), while all three selected functions can be reconstructed from public source.

| Stateful events | Ubuntu ratio of medians | Ubuntu upper paired median | Windows ratio of medians | Windows upper paired median |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 1.211x | 1.644x | 1.097x | 1.601x |
| 50 | 1.545x | 1.685x | 1.380x | 2.320x |
| 1,000 | 1.664x | 2.197x | 1.497x | 1.763x |
| 10,000 | 1.317x | 1.598x | 1.331x | 1.341x |

For this seven-pair COO sample, all eight one-sided upper bounds remain below 2.5x. This does not establish general protection quality: the static source-only attacker recovers the hot math functions.

The SCO comparison reuses the original six-module application and one generated public ESM facade, nine alternating native vs authorized fresh-client process trials for heavy (120,000 iterations per operation) and light (1 iteration) sessions, with server already initialized and HTTP on local loopback. Server-only initialization is excluded under the prompt allowance. A distinct existing [conditional bootstrap](../sims/application-challenge-sco-cold-bootstrap.js) reports a different estimand (ratio of resampled medians). The new [exact historical replay](../sims/application-challenge-sco-order-stat-reanalysis.js) reads the original pinned 43807548781 chronological observations, rather than inventing inputs. **Both platforms passed frozen source, browser, tests and JSDoc** in [SCO run 43998343404](https://github.com/FlareZ123/obfs/actions/runs/43998343404) and [later replay 43998726991](https://github.com/FlareZ123/obfs/actions/runs/43998726991).

| Measured SCO trial | Work | Ratio of medians | Paired median lower | Paired median upper | 2.5x decision |
| --- | --- | ---: | ---: | ---: | --- |
| Earlier 43998343404 Ubuntu | heavy | 2.340x | 2.200x | 2.485x | supported |
| Earlier 43998343404 Windows | heavy | 2.090x | 2.004x | 2.175x | supported |
| Earlier 43998343404 Ubuntu | light | 4.221x | 3.959x | 4.348x | exceeded |
| Earlier 43998343404 Windows | light | 3.094x | 2.955x | 3.166x | exceeded |
| Later 43998726991 Ubuntu | heavy | 2.386x | 2.339x | **2.50045x** | **inconclusive** |
| Later 43998726991 Windows | heavy | 1.965x | 1.938x | 2.048x | supported |
| Later 43998726991 Ubuntu | light | 4.161x | 3.956x | 4.403x | exceeded |
| Later 43998726991 Windows | light | 2.947x | 2.802x | 2.998x | exceeded |

The sampled Ubuntu heavy workload switches from supported to inconclusive across independent GitHub-hosted runs. On the latest run, the second-largest paired slowdown is 2.5004477x, a small exceedance, despite a passing ratio-of-medians of 2.386x. This is direct evidence that classifying near-threshold performance from a single median ratio is fragile.

The frozen historical run **43807548781** is independently reanalyzed, cross-platform verified at [43998726991](https://github.com/FlareZ123/obfs/actions/runs/43998726991):

| Historical sample | Ratio of medians | Paired median lower | Paired median upper | Decision |
| --- | ---: | ---: | ---: | --- |
| Ubuntu heavy | 2.4165x | 2.3073x | **2.499715x** | supported, extremely marginal |
| Windows heavy | 1.9907x | 1.9463x | 2.0337x | supported |
| Ubuntu light | 4.0482x | 3.8785x | 4.2826x | exceeded |
| Windows light | 2.7959x | 2.6019x | 2.8439x | exceeded |

The historical Ubuntu heavy upper endpoint is only 0.000285x below the budget. Its conditional bootstrap's ratio-of-medians upper percentile instead crosses 2.5x; these are **different estimands and different confidence constructions**, rather than a contradiction. Two-sided confidence, runner drift, real network RTT, TLS, cold server startup and broad app semantics are outside this inference.

## Security and engineering decision

The COO whole-session application includes genuinely frequent selected-function work but the public source-only attack still rebuilds it. SNO remains fully local and cannot authenticate code against an owner of the filesystem and runtime. SCO can withhold trusted-server source and key material, yet a legitimately authenticated attacker can relay protected outputs online. Hot granular remote calls commonly exceed 2.5x under transport overhead; coarse useful operations amortize transport at the cost of providing a powerful authenticated oracle.

Future promotion claims should show exact source/runtime versions, matched native/protected timing samples, both paired and unpaired median estimands, uncertainty and meaningful margin against 2.5x, independently measured attacker work and tested authorization. This experiment supplies the statistical gate only. Reproducers are [polyvariant-app-budget.js](../sims/polyvariant-app-budget.js), [application-challenge-sco-cold-session.js](../sims/application-challenge-sco-cold-session.js) and [application-challenge-sco-order-stat-reanalysis.js](../sims/application-challenge-sco-order-stat-reanalysis.js).
