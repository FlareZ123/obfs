# Exact zero-breach runtime tail diagnostic (17 November 2026)

**Classification:** intermediate measurement methodology, not a new JS obfuscation or adversarial security result. **Status:** full Linux/Windows/Chromium integration and independently source-pinned cross-mode adversarial release-evidence jobs green as experiments, with the tested protected system still **RELEASE-BLOCKED**. These bounds cannot certify the project's universal 2.5× compute rule.

## Why the existing median decision was insufficient

`sims/familywise-budget-bound.js` estimates the population median of paired obfuscated/native runtime ratios and reports the number of *observed* strict ratios greater than 2.5. A median upper confidence bound below 2.5 says nothing about the frequency of individual slowdowns above 2.5. A single strict observed breach must retain its separate release veto. Conversely, zero observed breaches cannot establish that no future breach is possible.

The additional `strictTail` output is an explicitly conditional, exact binomial diagnostic about **future breach frequency for the same declared workload distribution**, separate from the median analysis. It does not change the existing `verdict`.

## Derivation

Define `p = P(protected_runtime/native_runtime > threshold)` for independent representative paired samples from one *fixed* workload distribution. Let `n` be the number of samples, and suppose **zero strict breaches were observed**. The probability of that observation under rate `p` is `(1-p)^n`. Inverting the one-sided binomial test at significance level `alpha` gives the exact upper confidence limit

`p_upper = 1 - alpha^(1/n)`.

The implementation computes it as `-Math.expm1(Math.log1p(-confidence)/n)` to avoid floating-point cancellation. It declines invalid sample counts and confidence values.

For `m` predeclared distinct workload populations, we allocate total `alpha = 1 - confidence` as `alpha/m` to each workload (Bonferroni). Under independent and identically distributed pairs **within** each workload, the set of `m` upper confidence bounds attains simultaneous coverage of at least `1-alpha`; independence **between** workloads is unnecessary. An observed strict breach receives a `null` zero-breach bound for that workload, preserving the hard sample veto.

## Numerical examples at 95% requested confidence

| Independent paired samples per workload | Number of predeclared workloads | Zero-observation upper probability of a future strict breach |
| ---: | ---: | ---: |
| 9 | 1 | 28.31288356% |
| 9 | 2 | 33.62671169% |
| 72 | 1 | 4.07536862% |
| 72 | 10 | 7.09453742% |

The examples are numeric properties of the exact binomial model, **not measured breach frequencies** in the obfuscator. Even 72 zero-breach pairs do not exclude a nontrivial future risk. If 2/72 pairs have already breached the strict bound in the frozen COO four-way candidate, the sample is **failed** regardless of median confidence or any zero-breach bounds for unrelated workloads.

## Reproduction

- Implementation: `sims/familywise-budget-bound.js`; output `strictTail.confidenceRequested`, `perWorkloadConfidenceRequested`, `upperViolationRateWhenZero` and explicit sampling assumption.
- Tests: `test/paired-budget-bound.test.js`, including exact n=9 and n=72 values, monotonicity, invalid arguments, a 2-workload Bonferroni bound, and a n=13 population with a formally supported sampled median but one observed strict 3× slowdown.
- The existing median `verdict` and observed failure count are intentionally unchanged.

The diagnostic's probabilistic interpretation is invalid when samples are selected adversarially, correlated, repeatedly warmed in an unmodeled manner, or gathered under unrepresentative inputs/JIT tiers. There is no finite sampled confidence bound on the **worst-case** runtime of arbitrary JavaScript. The program still requires real client/Node/browser workload boundaries, cold/warm distinctions, and an unconditional veto for any actually observed strict >2.5× pair.


## Pinned integration

The [full Node 22 Linux/Windows and Ubuntu Chromium run 44201015222](https://github.com/FlareZ123/obfs/actions/runs/44201015222) completed **successfully at exact input source SHA `0debee4b86e0a999f30e089584827494d97fbd04`**. Each operating system ran 2,661 Node tests. Ubuntu passed 2,660, skipped one, failed zero; Windows passed 2,658, skipped three, failed zero. Both JSDoc configurations, baseline benchmark and real Chromium tests passed. The two new strict-tail tests executed at this pin; the generated client/server obfuscator code has not been changed by the new diagnostic. This integration does not exercise the full cross-mode release-evidence sample script, for which a separately pinned experiment is appropriate.


## Actual generated cross-mode report, after serialization integration

The [dedicated cross-mode release-evidence gate 44201847675](https://github.com/FlareZ123/obfs/actions/runs/44201847675) **passed** its test scripts, direct attacker comparisons and sample generation on Ubuntu and Windows at exact source SHA `51f0253c7253ac38fd5300769f804b70b9728fdc`. Both full job artifacts emitted `performance.crossModeFamilywise.strictTail` from **real native/protected sampled workloads**, preserving the original `RELEASE-BLOCKED` verdict. The final integrated `sims/release-evidence-gate.js` and its new serialization check are included at this SHA. The preceding run [44201570730](https://github.com/FlareZ123/obfs/actions/runs/44201570730) passed the same experiment at `b3a0671cf241c3ca45daf705a89efaeaab3c8bfc`, but predates surfacing the tail diagnostic in the output; do not claim it validated the new serialized field.

| Source-pinned Node 22 observation | Windows | Ubuntu |
| --- | ---: | ---: |
| Distinct paired workload populations | 10 | 10 |
| Observed strict >2.5× sample pairs | **9** | **10** |
| Observed maximum paired slowdown | **3.17053×** | **4.22885×** |
| Cross-mode median verdict | sample-exceeded | sample-exceeded |
| Overall evaluated release verdict | **RELEASE-BLOCKED** | **RELEASE-BLOCKED** |
| Independent functional clones recorded | COO, SNO, SCO relay | COO, SNO, SCO relay |

At simultaneous requested 95% confidence over these ten workloads, the zero-breach upper limit for each of the four **9-pair COO** workload populations was **44.49526922%**; for each of the four **13-pair SNO** populations it was **33.47303783%**. In both operating systems the 1-event SCO population had one or more **actual** strict breaches, and its zero-breach bound was correctly `null`. Ubuntu also observed a breach in the 120,000-event SCO population; Windows did not for that population, so its 9-pair zero-breach diagnostic was about 44.495%, not a worst-case clearance. Both operating systems' emitted `strictTail` metadata explicitly state the within-workload representative-independent-pair assumption. Between-workload independence is not required for the Bonferroni adjustment.

The **green workflow** denotes completed experiment execution, **not a positive release verdict**. This source-pinned comparison demonstrates why the prior median-supported labels for some workloads cannot establish the project's strict per-run compute cap. The original independent static and online functional reconstruction findings persist; this statistical reporting change does not strengthen emitted obfuscation or introduce runtime overhead.


## Reproduction-environment limitation

The source and workflow-run SHAs above are exact, and the workflow logs contain concrete Node versions and operating systems. They are **source-pinned experiments**, however, rather than fully hermetic build snapshots: `package.json` allows compatible ranges for Acorn, acorn-walk, TypeScript and Node types, and the workflows use `npm install --no-package-lock --ignore-scripts` on moving `ubuntu-latest`/`windows-latest` and Node 22 channels. Real Chromium also depends on runner-installed browser revisions. A later exact-SHA rerun may have different dependency/JIT/runtime distributions. High-confidence archival replication should separately record resolved dependency versions, browser binary/version and runner image with the raw paired timings, and should not pretend source SHA alone freezes the measurement environment.
