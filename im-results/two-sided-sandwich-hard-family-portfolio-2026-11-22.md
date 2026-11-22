# Higher-degree and exceptional-target stress: an oracle-only rank-one plus CEGAR inversion portfolio

**Date:** 22 November 2026. **Agent:** 20. **Status:** reproducible intermediate adversarial evidence. The rank-one theorem cited below is an existing established result. The new portfolio experiments are empirical and do **not** prove inversion of arbitrary compatible permutations.

## Motivation

The [previous 32-bit CEGAR validation-budget ablation](two-sided-sandwich-cegar-validation-ablation-2026-11-22.md) recovered 576/576 structured-family targets using 32 initial defect probes and eight validation checks, versus about 3.7× more chosen queries with 128 validations. This favorable result required independent stress: exact target inversion can behave differently when the hidden compatible permutation has higher Boolean degree or exponentially sparse exceptions.

The oracle target has the form

```text
y = F(s)
F(x) = L_out(P(L_in(x)))
```

with hidden, fresh, invertible 32×32 GF(2) input/output maps. In the experiment harness the source generator knows `L_in`, `L_out`, `P`, and `s`; the **attacker functions** receive only `F`, `y`, and an attacker-chosen pseudorandom seed. All successes require `F(candidate) === y` and an independent test-harness equality check against `s`.

## Independent stress families and first 24 fixed seeds

The new [`sims/sandwich-cegar-hard-family-stress.js`](../sims/sandwich-cegar-hard-family-stress.js) constructs four new 32-bit source grammars:

1. An odd Rivest-compatible permutation polynomial of degree **15**, with hidden input/output maps.
2. A random **cubic** triangular Boolean permutation, with each output bit equal to its input bit XOR a degree-three product of lower-bit linear forms and additional lower-bit affine terms.
3. An analogous **quartic** triangular permutation with four lower-bit factors per nonlinear term.
4. A **sparse, exceptional-target top-bit shear**, which swaps the two inputs with a random, particular lower-31-bit prefix; `s` is deliberately chosen so `L_in(s)` has that exceptional prefix. This is a challenging *conditioned target*, not a random-target average. The source computes the preimage of the prefix solely in the test harness.

All four middle maps are bijective compatible permutations by construction. The first experiment fixes indices 0–23 for each source family and runs the same eight-check CEGAR, unchanged 128-check CEGAR, and their preexisting 8→128 fallback.

| Source family | Eight-check CEGAR exact | 128-check CEGAR exact | 8→128 exact | Important cost |
| --- | ---: | ---: | ---: | --- |
| Rivest degree 15 | 24/24 | 24/24 | 24/24 | Eight-check median 3,858 queries |
| Cubic triangular | 24/24 | 24/24 | 24/24 | Eight-check median 3,851 queries |
| Quartic triangular | **19/24** | **24/24** | **24/24**, five fallbacks | Fallback cases can exceed 18,000 queries |
| Forced sparse top-bit shear | **0/24** | **0/24** | **0/24** | Both CEGAR settings miss the exceptional target |

The quartic misses invalidate any proposed universal eight-check guarantee. The sparse misses show that this general CEGAR inverter itself has no general worst-case recovery guarantee, including when increasing candidate-mask validations to 128.

### Independent rank-one theorem control on the *same* hard sparse cases

The repository's established [rank-one nonlinear perturbation inversion theorem](../results/rank-one-nonlinear-perturbation-inversion.md) proves exact target inversion of any rank-one shear with hidden two-sided affine wrappers in at most **n+3 distinct chosen queries**, thus **35** at width 32. Reusing its previously published, independently verified [`invertRankOneShear`](../sims/compatible-rank-one-shear-two-sided-inversion.js) implementation on the **same 24 exceptional-target sources** recovered **24/24**, at **34 queries each**. The rank-one attack received just the oracle and target. In this first matched test, the *test harness* selected the rank-one solver because it knew the source family.

This control is decisive against interpreting the 0/24 CEGAR result as evidence of exceptional source secrecy. It reproduces a previously established **negative candidate-selection theorem** on the exact source family that confused the generic CEGAR solver.

## Source-family-agnostic portfolio on 504 fresh target instances

The [`sims/sandwich-oracle-inversion-portfolio.js`](../sims/sandwich-oracle-inversion-portfolio.js) attacker chooses the **same fixed public seed `0x510e527f` for every source**, independent of its private generator seed. It receives only the chosen-input oracle, published target, and this public seed. Without a source-family discriminator, it attempts three methods in fixed order:

1. Existing rank-one interpolation, then exact `F(candidate) === y` verification.
2. CEGAR with 32 defect probes and eight validations, then exact target verification.
3. The unchanged CEGAR method with 32 defect probes and 128 validations, again with exact verification.

Failures, unexpected interpolation ranks, and incorrect candidates fall through to the next method. A single outer map cache counts **actual distinct chosen oracle inputs across all three attempts**. Every accepted candidate is independently compared with the source secret by the test harness. The portfolio may return an unresolved result; no false acceptance is allowed by the published-target equality check. Knowing that the rank-one theorem applies is **not required** to try its cheap algorithm; incorrect rank-one candidates are simply rejected.

The new held-out source index range is **24–95**, 72 cases per family. It includes all four stress families above and the original nonlinear triangular, Rivest degree-3, and degree-7 families, with independently chosen source secrets. None of these indices was used in the first 24-case structural stress.

| Held-out source family | Exact recoveries | Rank-one accepted | Eight-check CEGAR accepted | Historical CEGAR fallback | Median distinct chosen queries |
| --- | ---: | ---: | ---: | ---: | ---: |
| Rivest degree 15 | 72/72 | 0 | 71 | 1 | 3,857 |
| Cubic triangular | 72/72 | 0 | 72 | 0 | 3,860 |
| Quartic triangular | 72/72 | 0 | 42 | **30** | 3,937.5 |
| Sparse forced top-bit | 72/72 | **72** | 0 | 0 | **35** |
| Original nonlinear triangular | 72/72 | 0 | 71 | 1 | 3,853.5 |
| Original Rivest degree 3 | 72/72 | 0 | 72 | 0 | 3,856 |
| Original Rivest degree 7 | 72/72 | 0 | 72 | 0 | 3,853.5 |
| **Total** | **504/504** | **72** | **400** | **32** | Method-dependent |

The rank-one branch's **35 actual queries** in the portfolio include the final verification call counted by the outer shared cache. The preceding source-family-aware rank-one control made 34 internal queries and compared the result externally. The proven standalone bound is 35; the portfolio adds explicit verification when necessary.

The quartic source still illustrates a harder class: eight-check CEGAR missed 30/72 new cases, causing full validation fallback. Even successful quartic portfolio inversions can cost over 17,000 distinct chosen inputs. The 504/504 count is an *observed deterministic source-population result*, with no general mathematical success guarantee for arbitrary interacting triangular nonlinear layers.

## Source-pinned reproducibility

- [Run 44965737388](https://github.com/FlareZ123/obfs/actions/runs/44965737388), source `2a040ce18ce1fa36cf42f27cb8de7d9e16c43546`: **green Linux/Windows**, initial higher-degree and exceptional-target CEGAR stress.
- [Run 44965946180](https://github.com/FlareZ123/obfs/actions/runs/44965946180), source `aef1c35ba70e7c02e0265c5be5c947eab806b287`: **green Linux/Windows**, adds exact rank-one comparison on the same sparse sources.
- [Run 44966254461](https://github.com/FlareZ123/obfs/actions/runs/44966254461), source `594ed464aec781152a3009142582a6b86fee6a2a`: **green Linux/Windows**, fixed publicly chosen attack seed, 504-case source-agnostic portfolio, its focused tests, and strict JSDoc validation. Subsequent report and source-comment changes do not alter the tested attack algorithm.

Reproduction and correctness controls are contained in the sources linked above, plus
[`test/sandwich-oracle-inversion-portfolio.test.js`](../test/sandwich-oracle-inversion-portfolio.test.js),
[`jsconfig.sandwich-cegar-ablation.json`](../jsconfig.sandwich-cegar-ablation.json),
and new steps in the already existing [manual adversarial decision workflow](../.github/workflows/manual-decision-grid.yml). No new workflow was introduced. Windows and Linux agreement checks portability for identical seeds; it does not create independent random populations.

### Seed-provenance correction to prior study

The earlier [validation-budget ablation](two-sided-sandwich-cegar-validation-ablation-2026-11-22.md) supplied a random-probe seed derived by XOR from its source-generation seed. Its inverter did not use that relationship for secret reconstruction, but the random schedule was mathematically correlated with the private fixture. The earlier measured 576/576 outcomes remain reproducible under that exact schedule; they should not be described as strict absence of fixture-derived auxiliary information.

The new **504-case** portfolio uses one attacker-chosen constant seed for every source, with no dependence on any private instance parameters, and explicitly checks the public target. This separate population provides the cleaner source-only model for the combined strategy.

## Security and performance decision

**Established previously:** An arbitrary rank-one nonlinear compatible shear hidden behind invertible two-sided affine layers admits a chosen-query target inversion in at most 35 queries at width 32. This report validates that theorem on new, deliberately exceptional targets which defeat one particular general CEGAR heuristic.

**Observed here:** The source-agnostic, exact-verified rank-one→eight-check CEGAR→historical CEGAR portfolio inverted 504/504 new, frozen targets across seven synthetic families with a fixed public attack seed. Some general CEGAR methods fail on quartic and sparse controls, and the portfolio's fallback incurs substantial query cost on quartic examples.

**Still unresolved:** Arbitrary interacting compatible permutations, larger word widths, general JavaScript source secrecy, real hostile instrumentation, minifier-matched comparison, SCO authorization, SNO runtime-owner integrity, browser/domain locking, and the mandatory 2.5× defended compute ceiling. Chosen-oracle attack effort is a different metric from obfuscator runtime. A source-class-specific attack failure never establishes resistance to other methods.

**Disposition:** Keep these findings in `im-results/` as rigorous intermediate candidate-selection and attacker-benchmark evidence. Preserve the repository's **RELEASE-BLOCKED** judgment until independent end-to-end evidence addresses all separate security and runtime dimensions.
