# Forced rare-target compatible shear: CEGAR miss versus 34-query rank-one inversion

**Agent:** 20. **Date:** 22 November 2026. **Status:** reproducible intermediate attacker-method stress test. The separate rank-one inversion theorem is already established; this experiment adds a direct matched comparison on adversarially selected targets.

## Question and motivation

The previous [chosen-query CEGAR ablation](two-sided-sandwich-cegar-validation-ablation-2026-11-22.md) recovered 576/576 held-out targets across three synthetic compatible-permutation families using eight per-mask validations and 32 structural probes. It explicitly did not prove recovery of every compatible permutation. This new experiment tests whether a deliberately rare nonlinear change at the *selected target* defeats that target-inversion algorithm, and asks whether a stronger existing attack still succeeds.

The adversary receives a chosen-input oracle `F`, a target `y=F(s)`, and the family construction. The 32-bit secret `s`, marker, and two private random invertible GF(2) maps are withheld from the attack functions. A separate source-known harness builds and validates each instance.

## Construction and proof obligations

For each deterministic seed, make full-rank maps `L_in` and `L_out`. Let `e25 = 2^25`. Define

```text
P_a(z) = z XOR (e25 if (z & 65535) == a else 0)
F(x)   = L_out(P_a(L_in(x)))
a      = L_in(s) & 65535
```

By construction, the selected target is inside the branch altered on just 1/65,536 of a uniform 32-bit input domain. The matched control is a different secret in the *same* oracle, chosen by toggling an input basis bit that changes the lower sixteen coordinates of `L_in(x)`. Thus the control is guaranteed outside the altered coset.

This is a compatible permutation: the gate depends only on lower sixteen bits and toggles bit 25. Applying it twice restores the input because the gate does not depend on bit 25. The two linear wrappers are generated through the repository's existing invertible-map constructor. All sources and chosen target inputs are deterministic.

The same construction is also a rank-one nonlinear perturbation:

```text
F(x) = A(x) XOR w*f(x)
A    = L_out composed with L_in
w    = L_out(e25)
f(x) = [ (L_in(x) & 65535) == a ]
```

Here `u=L_in^-1(e25)` leaves `f(x XOR u)=f(x)`. Therefore the already established [rank-one inversion theorem](../results/rank-one-nonlinear-perturbation-inversion.md) applies and supplies a separate exact attack with at most 35 chosen queries. This is a critical control: failure of CEGAR cannot imply that the obfuscation is resistant to target inversion.

## Frozen population and methods

Six seeds use `u32(0x5eed17a9 XOR imul(index+1,0x9e3779b9))` for indices 0–5. The two hidden linear maps, secret, and marker are derived from different fixed seed salts. For each seed:

1. Test the original `invertLinearSandwich` CEGAR procedure separately on the forced rare target and its same-function ordinary control with `defectSamples=32` and `validationTrials=8`.
2. Repeat with the historical `validationTrials=128`. Each attempt gets its own input-query cache. Keep all errors, including the final target-equality check, as unsuccessful attempts.
3. Apply the independent existing `invertRankOneShear` procedure to both targets, assert the exact original secret and `queryCount<=35`, and record the interpolation rank.

The source is [`test/sandwich-cegar-rare-branch-pilot.test.js`](../test/sandwich-cegar-rare-branch-pilot.test.js). No defender obfuscator runtime is changed. The test uses only existing attack implementations, existing deterministic source generators, and Node's test runner.

## Source-pinned observations

| Algorithm | Changed-coset selected targets | Same-oracle control targets | Distinct queries per changed target |
| --- | ---: | ---: | --- |
| CEGAR, 32 initial defects and 8 validations | **0/6** | 6/6 | 3,839–3,861 |
| CEGAR, 32 initial defects and 128 validations | **0/6** | 6/6 | 14,155–14,197 |
| Exact rank-one inverter | **6/6** | 6/6 | **34 each** |

Every CEGAR rare-target failure was the explicit `sandwich inversion failed final equality` exception, not a false successful answer. Both operating systems reproduced the same recovered counts and distinct-query arrays. The rank-one interpolant had full rank (32) in all six instances, and the 34-query inverter exactly recovered both rare and ordinary targets.

Source pins:

- [Pilot focused validation 44992117787](https://github.com/FlareZ123/obfs/actions/runs/44992117787), source commit `a69e75f2bd27f517f88518206ac037d527b4fcd4`: Linux and Windows Node 22 passed; six rare CEGAR misses at both validation budgets, six matched-control recoveries at both budgets.
- [Matched-specialist validation 44992228122](https://github.com/FlareZ123/obfs/actions/runs/44992228122), source commit `9a849b695227e400a3645fa971af67b52c00ad0e`: Linux and Windows Node 22 passed, including both strict JSDoc steps. The added independent rank-one inversion recovered all twelve secret/control targets with 34 distinct queries each.

The exact seeds and individual query counts are printed as `RARE_COMPATIBLE_CEGAR` records in the two focused validation jobs of each run. Wall-clock samples reflect unrelated CI noise and are not interpreted as protected runtime cost.

## Interpretation and decision

This counterexample sharpens the earlier 576/576 observation: the 8-check CEGAR choice, and even its 128-check historical fallback, do not reliably recover a chosen rare nonlinear target in this source population. The effect is selected-target conditional; a random target would hit the altered branch at probability 1/65,536, so the experiment should not be misreported as a uniform random-case failure rate.

The same functions are *not* hard to invert under the repository's better-matched rank-one theorem. The exact specialized attacker succeeds with 34 queries, approximately two orders of magnitude fewer than the failing 8-check general inverter. Consequently, hiding one sparse high-bit toggle between two unknown linear maps is an unpromising strong-confidentiality construction, despite a conspicuous general-attack miss.

This is evidence about attacker-method selection on synthetic 32-bit function oracles. It establishes no static source-extraction barrier, dynamic instrumentation resistance, domain-locking guarantee, complete-session 2.5× compliance, or advantage over an equally private minified service. The overall **RELEASE-BLOCKED** decision remains intact. A meaningful next challenge should use *interacting* nonlinear layers outside the proven rank-one class, and should still compare the strongest applicable specialized attacks.
