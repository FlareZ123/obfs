# Chosen-oracle CEGAR inversion: validated-probe ablation for two-sided 32-bit affine sandwiches

**Agent:** 20. **Date:** 22 November 2026. **Classification:** reproducible *intermediate* attack-effort evidence. No universal inversion theorem or obfuscation-security claim.

## Question and adversary

For the existing 32-bit synthetic function family

```text
F(x) = L_out(P(L_in(x)))
```

where `L_in` and `L_out` are invertible but unknown GF(2)-linear maps and `P` is one of three compatible-permutation constructions, how many distinct chosen oracle queries does the repository's two-sided CEGAR **target inverter** need? The attacker knows only the 32-bit oracle `F` and a published target `y=F(secret)`. The input/output affine maps, polynomial/triangular parameters and secret remain outside the attacker function. The source generator knows them to create and verify a frozen test oracle.

The previous simulator [`sims/compatible-permutation-linear-sandwich-blackbox.js`](../sims/compatible-permutation-linear-sandwich-blackbox.js) used 32 directional second-derivative probes plus 128 fresh candidate-mask validations at each bit level, yielding approximately 14,100–14,300 distinct oracle queries per tested target. The finite validation step was never a proof for arbitrary compatible permutations. Our experiment varies these two budgets independently while preserving the prior `32/128` defaults, oracle cache, seed derivation, and final exact target-equality check.

## Exact methods and frozen source populations

Three deterministic 32-bit synthetic families from the original simulator are retained unchanged: a nonlinear triangular bit permutation, and Rivest-compatible integer permutation polynomials of degrees 3 and 7. For each source index `i`, the fixed FNV-derived seed builds a new private `P`, two private dense invertible `L` maps, and a new secret; `y` is published to the inverter. This is a structured source family rather than a general JavaScript program, random public minification comparison, or independent source decompiler.

- **Validation-grid training:** indices 0–31 for each family, 96 targets total, `validationTrials=[0,4,8,16,32,64,128]`, `defectSamples=32`. Eight checks were selected from this development set.
- **Held-out A:** new source indices 32–127, 96 targets per family, 288 total. Precommitted strategy: 8 checks; on any non-recovery or failed final equality, restart the unchanged 128-check procedure; outer memoization counts **distinct actual oracle evaluations across retries**. Baseline runs independently with 128 checks.
- **Defect-probe ablation:** same development indices 0–31, `defectSamples=[2,4,8,16,32]` with eight validations. The fixed rule selects the **lowest average oracle cost among settings recovering all 96 training targets**.
- **Held-out B:** new source indices 128–223, another 288 targets, using the selected `defectSamples` and the same 8-check then unchanged `32/128` fallback, paired with unchanged baseline.
- **Verification:** the inverter itself queries the candidate preimage and compares `F(candidate)` against `y`, the parent separately compares recovered input against the held-out secret. Distinct chosen inputs exclude the test harness's one-time computation of the published target. Both applications share exactly the same private oracle source per paired index.

Reproduction sources:
- [`sims/sandwich-cegar-validation-sweep.js`](../sims/sandwich-cegar-validation-sweep.js)
- [`sims/sandwich-cegar-heldout-adaptive.js`](../sims/sandwich-cegar-heldout-adaptive.js)
- [`sims/sandwich-cegar-defect-sweep.js`](../sims/sandwich-cegar-defect-sweep.js)
- [`test/sandwich-cegar-validation-budget.test.js`](../test/sandwich-cegar-validation-budget.test.js)
- [`jsconfig.sandwich-cegar-ablation.json`](../jsconfig.sandwich-cegar-ablation.json)
- The existing [manual two-OS decision workflow](../.github/workflows/manual-decision-grid.yml), extended with focused research and strict JSDoc steps, without a new workflow.

## Observations

### Validation budget, development indices

| Validations per candidate | Nonlinear triangular exact | Degree-3 exact | Degree-7 exact | Combined |
| ---: | ---: | ---: | ---: | ---: |
| 0 | 27/32 | 25/32 | 23/32 | **75/96** |
| 4 | 30/32 | 31/32 | 31/32 | **92/96** |
| 8 | 32/32 | 32/32 | 32/32 | **96/96** |
| 16 | 32/32 | 32/32 | 32/32 | **96/96** |
| 32 | 32/32 | 32/32 | 32/32 | **96/96** |
| 64 | 32/32 | 32/32 | 32/32 | **96/96** |
| 128 | 32/32 | 32/32 | 32/32 | **96/96** |

Failing under-validated runs report missing output functionals or final target mismatch and are counted as misses. The exact attempt for nonlinear-triangular case 6 fails at zero validation yet recovers at the historical 128 checks; the regression retains this non-recovery control. A separate two-point, highest-bit sparse compatible swap is recovered even at zero checks, illustrating why global affine-function certification and target-guided inversion are distinct problems.

### Held-out A, index range 32–127

| Family | Exact targets | 8-check median distinct queries | 128-check median | Fallbacks |
| --- | ---: | ---: | ---: | ---: |
| Nonlinear triangular | 96/96 | 3,846.5 | 14,175 | 0 |
| Rivest degree 3 | 96/96 | 3,851 | 14,175 | 0 |
| Rivest degree 7 | 96/96 | 3,856 | 14,183.5 | 0 |

This is a **3.678–3.685×** reduction in median distinct oracle queries for these exact source-family populations, equivalent to approximately 72.8% fewer queries. It is *attacker query cost*, not obfuscator runtime or wall-clock speed.

### Initial defect-probe ablation, development indices

| Probes per bit level | Exact target recoveries at 8 validations |
| ---: | ---: |
| 2 | 0/96 |
| 4 | 0/96 |
| 8 | 0/96 |
| 16 | 18/96 |
| **32** | **96/96** |

Thus the fixed training rule retained `defectSamples=32`. Weak initial defect spans can leave misleading output functionals; subsequent short validation cannot always repair the missing structural evidence. The 18 successes with 16 probes averaged about 6,948 distinct queries, worse than the 32-probe setting's approximately 3,852 average.

### Held-out B, untouched index range 128–223

| Family | Exact targets | Selected 32/8 median | Historical 32/128 median | Fallbacks |
| --- | ---: | ---: | ---: | ---: |
| Nonlinear triangular | 96/96 | 3,847 | 14,173.5 | 0 |
| Rivest degree 3 | 96/96 | 3,851.5 | 14,177.5 | 0 |
| Rivest degree 7 | 96/96 | 3,850 | 14,175 | 0 |

All **576 / 576** held-out targets across A and B were recovered exactly on the observed deterministic source families, and neither batch invoked its high-budget fallback. The attacker's limited-known-family successes do not imply universal target inversion of arbitrary 32-bit compatible-permutation sandwiches.

## Source pins and independent operating-system checks

- [Two-OS run 44964801870](https://github.com/FlareZ123/obfs/actions/runs/44964801870), source `584181897ea730386939cbe9dbf1e8834bc2ea06`, **green**. Validation-grid and held-out A scripts executed on Ubuntu and Windows Node 22; direct tests passed. An earlier red at [44964650180](https://github.com/FlareZ123/obfs/actions/runs/44964650180) was an invalid test expectation that a null option should throw; the code legitimately treats it as omitted.
- [Two-OS run 44965098251](https://github.com/FlareZ123/obfs/actions/runs/44965098251), source `359efccab9f46578fa651f0546d6fd8c21c71482`, **green**. Added precommitted defect-grid selection, fresh held-out B and corrected sparse-vs-target regression. Earlier red [44964958325](https://github.com/FlareZ123/obfs/actions/runs/44964958325) exposed a mistaken hypothesis that a sparse two-point swap must defeat target-guided inversion. That erroneous assertion was corrected before the green run.
- An additional strict JSDoc gate was added afterward. The first typecheck run [44965247380](https://github.com/FlareZ123/obfs/actions/runs/44965247380) reported one missing numeric parameter annotation in the new test; the source has been corrected and the next two-platform validation is recorded in the workflow history.

All experiments execute in the existing reproducible Node 22 workflow. Operating-system agreement for the same fixed seeds checks implementation portability; it does not create independent random research populations.

## Boundary and decision

**Supported:** Lowering candidate-mask validation from 128 to 8, while retaining 32 structural defect probes, cut the measured chosen-query cost by about 73% across two untouched deterministic 288-target sets. The predeclared exact-equality fallback is implemented and tested as a safety net; it was unused in these samples. The missing-probe ablation provided a negative control and identified severe non-recovery below 32 probes in these families.

**Unresolved:** Arbitrary compatible permutations can exhibit exponentially sparse nonlinear defects. The repo already proves an exact global-affine-certification lower bound for such defects in [the sparse two-sided note](two-sided-sparse-certification-lower-bound-2026-11-19.md), carefully distinguished there from target-inversion complexity. The selected 8-check strategy has no finite-query guarantee for every source family. This work does not measure independent static source reconstruction, dynamic DevTools extraction, a general functional clone, authorization bypass, host locking, or the obfuscated runtime's strict 2.5× CPU bound. It supplies no demonstrated attacker-cost advantage over an equally secret, source-matched conventional minified API.

**Decision:** Retain as intermediate attacker-method research and a stronger finite-budget test against proposed affine-wrapped compatible-permutation obfuscation. Do not promote into `results/` or change the repository's **RELEASE-BLOCKED** strong-protection judgment without independent analysis and same-trust comparisons.


## Addendum: attack RNG seed provenance and stronger independent-source control

The original source-family reproducibility schedule in
`sims/sandwich-cegar-validation-sweep.js` sets
`attackSeed = sourceSeed XOR 0x510e527f`. Although
`invertLinearSandwich` consumes the seed **only to choose random oracle probes**
and never reconstructs hidden maps from it, the supplied seed is mathematically
correlated with private fixture generation. The original 576 held-out successes
are valid measurements for that deterministic seeded algorithm, but the
statement that their random schedule carried *literally zero* source-related
side information was overly strong. Do not infer source-only secrecy results
from that fixture without further controls.

The subsequent [source-agnostic portfolio study](two-sided-sandwich-hard-family-portfolio-2026-11-22.md)
passes the **same publicly chosen seed `0x510e527f` across every hidden
source instance**, independent of its private generator seed, source family,
and secret. Its attacker function receives only a chosen-input oracle, target,
and that fixed public seed. The independent-source schedule addresses the
provenance concern for that separate population; it does not retroactively
alter the old seeded-population numbers.
