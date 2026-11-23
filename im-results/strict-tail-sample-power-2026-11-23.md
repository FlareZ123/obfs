# Familywise strict-breach sample-size planning (23 November 2026)

**Classification:** Intermediate evidence and planning mathematics, **not** a new obfuscation/security result. **Sender:** Agent 17.

## Question

How many *breach-free* paired original/protected workload trials would be necessary to support a prespecified upper confidence limit on the **frequency** of strict >2.5× performance violations? Existing `sims/familywise-budget-bound.js` correctly reports a one-sided binomial upper bound **after** observing zero strict violations; this addition inverts the formula **before** a test campaign. It does not replace the project's hard rule that *any observed strict pair* is a workload-level veto, regardless of medians or confidence.

## Bound and derivation

For a fixed workload population with independent representative native/protected paired runs, let `p` be the probability that the paired ratio is **strictly greater** than 2.5. The probability of zero such events in `n` trials is `(1-p)^n`. Hence after zero observed breaches the exact one-sided (Clopper–Pearson) upper confidence endpoint is

```
p_upper = 1 - (alpha/K)^(1/n).
```

For `K` predeclared workload populations and target *simultaneous* confidence `1-alpha`, allocating `alpha/K` to each one-sided population bound guarantees at least `1-alpha` joint coverage by the union bound, **without requiring independence between populations**. It does require independent representative pairs **within** each fixed population. Requiring `p_upper <= epsilon` gives the minimum integer number of zero-breach pairs **per** population:

```
n_min = ceil(log(alpha/K) / log(1-epsilon)).
```

The implementation uses `log1p` and `expm1`, compares log probabilities near integer boundaries and refuses unsafe-integer sample counts. It does not estimate dependence, nonstationarity, warmup artifacts, or selection bias in the tested workload set.

## Concrete 12-population planning grid (95% joint confidence)

| Target breach-frequency upper bound in *every* fixed workload | Required zero-breach pairs *per* workload | Total sampled pairs |
| --- | ---: | ---: |
| 10% | 53 | 636 |
| 5% | 107 | 1,284 |
| 1% | 546 | 6,552 |
| 0.1% | 5,478 | 65,736 |

With **9** breach-free pairs in each of twelve fixed populations, the one-sided familywise upper rate per population remains **45.6084%**. With **13** it remains **34.3995%**. These values quantify the limits of short green runs; they are **not** estimates that the actual breach rate is this large. Actual red workloads with one or more strict violations already fail the project's observed hard-budget rule.

## Reproduction and scope

- `sims/strict-tail-power.js` exports `planZeroBreachSamples(maxBreachRate,confidence,workloadCount)`, returning the minimal per-workload count and its adjacent upper bounds. Run the four `test/strict-tail-power.test.js` Node tests with `node --test test/strict-tail-power.test.js`.
- Local Node 22.16.0 execution on 23 November passed **4/4 tests**. These cover the 12-population table, 144 combinations of confidence/target/population size against a separate inversion expression, the 9-versus-13 sample comparison, and invalid inputs. This is a **local** result; no Linux/Windows GitHub Actions result is asserted here.
- The threat/cost interpretation is deliberately narrow: **not** a universal worst-case compute bound, **not** an absence-of-breaches guarantee, **not** evidence for obfuscation efficacy, **not** an assessment of COO/SNO/SCO secret preservation, and **not** a substitute for adversarial proof, semantic parity, same-source benchmark and equal-trust minifier/service controls.
- Reusing data to decide which populations to count or which threshold to report invalidates the planned simultaneous guarantee. A single observed threshold violation is not erased by any successful confidence calculation.

Keep this planning aid in `im-results/` rather than promoting it to `results/`: it is a useful exact binomial inversion of an established test framework, not novel publishable obfuscation mathematics.
