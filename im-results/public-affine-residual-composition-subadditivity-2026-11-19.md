# Public affine-residual rank is subadditive under composition

**Date:** 2026-11-19  
**Agent:** 1  
**Classification:** intermediate algebraic result with exhaustive width-2 validation; independent review requested.

## Statement

For maps over binary vector spaces,

```text
F : U -> V
G : V -> W,
```

let `R_F` and `R_G` be the intrinsic public affine-residual
subspaces: the unique least output subspaces whose quotient makes each
map affine. Choose an affine decomposition of `G`

```text
G(y) = b XOR L_G(y) XOR delta_G(y),
delta_G(y) in R_G.
```

Then

```text
R_(G o F) <= R_G + L_G(R_F).
```

Consequently,

```text
r(G o F)
  <= dim(R_G + L_G(R_F))
  <= r(G) + r(F).
```

For a chain of maps `F_t o ... o F_1`,

```text
r(F_t o ... o F_1) <= sum_i r(F_i).
```

Affine layers have residual rank zero, so inserting arbitrary
invertible affine mixing between low-rank nonlinear layers does not
increase this upper bound.

This is a candidate-design constraint. If every nonlinear layer adds at
most `s` residual output directions, then `t` such layers have

```text
r_total <= min(n, t*s).
```

The chosen-query result in
`im-results/public-affine-residual-rank-target-inversion-2026-11-19.md`
therefore applies to the composed public permutation with expected
query bound

```text
n + 1 + 2^(r_total + 1)
```

using the rank-only form of that theorem.

## Proof

Write

```text
F(x) = A_F(x) XOR delta_F(x),
delta_F(x) in R_F,
```

where `A_F` is any affine interpolant whose residuals span `R_F`.
Likewise write

```text
G(y) = b XOR L_G(y) XOR delta_G(y),
delta_G(y) in R_G.
```

Substitution gives

```text
G(F(x))
 = b
 XOR L_G(A_F(x))
 XOR L_G(delta_F(x))
 XOR delta_G(F(x)).
```

The first two terms form an affine function of `x`. Every remaining
value lies in

```text
L_G(R_F) + R_G.
```

Hence quotienting `G o F` by that subspace yields an affine map. By
the minimal-quotient characterization of the intrinsic residual
subspace,

```text
R_(G o F) <= R_G + L_G(R_F).
```

Taking dimensions proves subadditivity. Iterating proves the chain
bound.

The subspace witness can be tighter than the scalar sum because
`L_G(R_F)` may lose rank or overlap `R_G`. The additive rank bound
is the representation-independent coarse consequence.

## Affine interleaving does not help

If `A` is affine, `r(A)=0`. Therefore

```text
r(G o A o F) <= r(G) + r(F).
```

When `A` is an affine automorphism, the separate coordinate-invariance
result in
`im-results/public-affine-residual-coordinate-invariance-2026-11-19.md`
shows it merely transports the residual subspace without changing its
dimension.

Thus a design cannot turn a short stack of low-direction nonlinear
layers into a high-residual-rank public permutation merely by inserting
dense public affine mixers.

## 32-bit candidate stop rule

For a 32-bit public permutation made from `t` rank-one nonlinear
layers separated by arbitrary affine automorphisms,

```text
r_total <= min(32, t).
```

The existing rank-only inversion theorem therefore gives these expected
query ceilings:

| nonlinear layers | residual-rank ceiling | expected chosen-query ceiling |
| ---: | ---: | ---: |
| 4 | 4 | 65 |
| 8 | 8 | 545 |
| 12 | 12 | 8,225 |
| 16 | 16 | 131,105 |
| 20 | 20 | 2,097,185 |

These are attack upper bounds, not lower bounds on security. Structural
attacks can be much cheaper. The established rank-one perturbation
result is an example where stronger structure collapses inversion below
the generic residual-rank ceiling.

The practical implication is a screening rule: a layered candidate
that relies on only a few independently nonlinear output directions
cannot claim that dense affine mixing alone defeats the public
residual-rank attack.

## Exhaustive width-2 validation

The audit

```text
sims/public-affine-residual-composition-width2.js
```

enumerates every function

```text
GF(2)^2 -> GF(2)^2.
```

There are

```text
4^4 = 256
```

such functions. It checks every ordered pair, for

```text
256^2 = 65,536
```

compositions.

For each pair it constructs

```text
S = R_outer + L_outer(R_inner)
```

and directly verifies that every standard-interpolation residual of the
composition lies in `S`. It also checks

```text
r(composition) <= dim S <= r(outer) + r(inner).
```

The exhaustive test intentionally covers non-permutations as well,
matching the theorem's general function scope.

A second sweep

```text
sims/public-affine-residual-composition-width3.js
```

enumerates all 40,320 width-3 permutations, selects one deterministic
representative of each residual rank 0 through 3, and checks composition
in both orders against every permutation. This adds 322,560
higher-width composition checks and reaches residual rank 3.

## Scope

This result constrains one algebraic escape route. High residual rank
remains necessary only relative to the chosen-query residual attack.
It is not sufficient evidence of source secrecy, tamper resistance,
dynamic-analysis resistance, or environment locking.

A single computationally cheap layer can already have high residual
rank while remaining trivially invertible from its public source. The
result therefore favors evaluating both residual rank and independent
static/dynamic inversion attacks rather than optimizing rank alone.

## Validation status

The first manual run
[44474161876](https://github.com/FlareZ123/obfs/actions/runs/44474161876)
correctly exposed a bad test expectation: on width 2 there is only one
non-frame input, so residual rank is at most one. The theorem assertions
inside the exhaustive simulator did not fail.

After correcting that expectation and adding the width-3 sweep, manual
run
[44474362982](https://github.com/FlareZ123/obfs/actions/runs/44474362982)
passed on Ubuntu and Windows at exact executable source
`298ae4dd08abd289247691828044c42dd05abb4f`, including both
composition audits, the existing low-rank theorem regressions, project
typecheck, and strict external JSDoc under Node 22.23.4.

Independent proof review is still required before promotion. Keep this
result in `im-results/` until then.
