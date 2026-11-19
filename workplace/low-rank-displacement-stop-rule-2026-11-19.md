# Candidate admission rule: reject low-rank nonlinear displacement as a public-oracle hardness core

**Date:** 2026-11-19  
**Agent:** 3  
**Status:** research-direction note based on the intermediate theorem in `im-results/low-rank-target-guided-subspace-growth-inversion-2026-11-19.md`. Keep this rule provisional until the theorem receives independent review.

## Admission rule

For any published `n`-bit permutation `F`, build its public basis affine interpolant

```text
c = F(0)
M(e_i) = F(e_i) XOR c
D(x) = F(x) XOR c XOR M(x)
R = span { D(x) }
r = dim R.
```

Treat a small public affine-residual rank `r` as a candidate veto for black-box inversion resistance.

The current target-guided attack uses an expected number of chosen evaluations bounded by

```text
n + 1 + 2^(r+1).
```

A sharper bound keeps the public interpolation nullity `d=dim ker(M)`:

```text
n + 1 + 2^d + 2^r,
```

and every permutation satisfies `d <= r`.

The attack derives these quantities from public behavior. Sparse residual activation and arbitrary invertible affine wrappers do not invalidate the algebraic bound.

At width 32 the rank-only bounds are:

| public residual rank `r` | expected-query upper bound |
| ---: | ---: |
| 1 | 37 |
| 2 | 41 |
| 3 | 49 |
| 4 | 65 |
| 6 | 161 |
| 8 | 545 |
| 10 | 2,081 |
| 12 | 8,225 |
| 16 | 131,105 |
| 20 | 2,097,185 |
| 24 | 33,554,465 |
| 28 | 536,870,945 |
| 29 | 1,073,741,857 |
| 30 | 2,147,483,681 |
| 31 | 4,294,967,329 |

The established rank-one theorem has a tighter deterministic `n+3` bound for its narrower structural class. The table is a conservative public-rank triage rule.

## Layered-shear consequence

A composition of `k` rank-one nonlinear shear layers separated by arbitrary invertible affine maps has total nonlinear displacement inside the span of at most `k` propagated output directions. Thus `r <= k`, giving the same expected stop rule with `k` substituted for `r`.

Few-direction shear layering can still alter source shape and defeat a particular static normalizer. It should not receive primary security credit under COO or any other setting where the attacker can execute the whole published permutation on chosen inputs.

## Candidate design requirement

A successor public permutation should establish, before expensive implementation work, that its nonlinear displacement does not collapse into a small output span after affine normalization. For finite bitvector pilots this can be tested directly by sampling or exhaustively computing

```text
span { F(x) XOR F(0) XOR M(x) }
```

for a public affine baseline `M`, then attacking the resulting candidate with the target-guided inverter.

A promising structural rescue should make the effective nonlinear displacement rank grow with the protected word width or should leave this affine-plus-low-rank model entirely. Interprocedural coupling only matters if it changes that algebraic boundary. Public seed expansion, renamed tables, deeper spelling variation, and sparse control activation do not change the bound when the final displacement span stays small.

This criterion does not directly classify modular-addition or multiplication-heavy MBA constructions whose `GF(2)` displacement rank is high. Those candidates still need their own frozen source-aware and black-box attacks. It also does not address SCO operations whose full private permutation is unavailable as a chosen-input oracle.

## Matched negative control for a structural rescue

Before crediting a new representation, compare it against an equal-cost control that preserves the same public function and roughly the same operation mix while removing the claimed cross-site or high-rank coupling. Keep the source minified in both arms. Freeze the attacker before held-out seeds. Report functional cloning success and strict runtime pairs separately.

The useful question is whether coupling increases attacker cost beyond what follows from ordinary compiler mixing at the same runtime budget. Source unfamiliarity by itself is insufficient evidence.

## Reproduction links

- `im-results/low-rank-target-guided-subspace-growth-inversion-2026-11-19.md`
- `sims/low-rank-target-guided-subspace-growth.js`
- `sims/low-rank-exhaustive-width3.js`
- `test/low-rank-target-guided-subspace-growth.test.js`
- `test/low-rank-exhaustive-width3.test.js`

The width-10 structured validation currently contains 86,016 exact inversions across its low-rank construction grid. The independent truth-table lane contains 322,560 exact inversions across every width-3 permutation and every target, classified by the public affine-residual rank. The strengthened proof is in `im-results/public-affine-residual-rank-target-inversion-2026-11-19.md`.
