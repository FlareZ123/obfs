# Quadratic extended-affine equivalence recovery as an obfuscator attack lane

**Captured:** 19 November 2026 by Agent 2.

## Primary source

Anne Canteaut, Alain Couvreur, and Léo Perrin, *Recovering or Testing Extended-Affine Equivalence*, IEEE Transactions on Information Theory 68(9), 6187–6206, 2022.

- DOI: https://doi.org/10.1109/TIT.2022.3166692
- Open preprint: https://arxiv.org/abs/2103.00078

The paper studies recovery of hidden affine maps when

```text
G = A composed with F composed with B + C.
```

For quadratic vectorial Boolean functions it gives an efficient EA-recovery algorithm based on discrete Jacobian matrices.

## Key identity for quadratic functions

For quadratic `F`, define the linear part of the Boolean Jacobian by

```text
Jac_lin F(x)[i,j]
= Delta_(e_j) F_i(x) + Delta_(e_j) F_i(0).
```

The paper proves that if

```text
G = A composed with F composed with B + C,
```

then

```text
Jac_lin G(x)
= A0 * Jac_lin F(B(x)) * B0,
```

where `A0` and `B0` are the linear parts of the affine permutations. The additive affine term `C` disappears from this identity.

This is directly relevant to obfuscation candidates that try to hide a known or enumerable quadratic nonlinear core between unknown affine wrappers.

## Recovery outline from the paper

The published algorithm:

1. computes rank tables and rank distributions of `Jac_lin F(x)` and `Jac_lin G(x)`;
2. selects a small number of reference vectors with informative, infrequent Jacobian ranks;
3. guesses matching vectors on the other function;
4. for each guess solves linear systems of the form

```text
X * Jac_lin G(v_i) = Jac_lin F(w_i) * Y
Y * v_i = w_i
```

for matrices `X,Y`;
5. searches the resulting small solution space for nonsingular `X,Y`;
6. recovers the remaining affine terms and verifies the equivalence.

The paper reports that three vector guesses are often enough for the tested random quadratic cases. It gives an estimated complexity depending on the Jacobian-rank distribution and the number of low-rank vectors. Its difficult APN case remains exponential in `n`, while many random quadratic examples are much easier.

## Relevance to this repository

The obfs research model repeatedly considers constructions with unknown affine maps around nonlinear permutation cores. The current exact attacks already show:

- one arbitrary affine wrapper around any compatible permutation is chosen-query invertible;
- a single rank-one nonlinear perturbation remains invertible with both affine wrappers hidden;
- low-dimensional nonlinear displacement with a full-rank affine interpolant is cycle-invertible.

Quadratic multi-shear constructions should therefore receive a separate Jacobian/EA-recovery attack before they are treated as plausible hard candidates. A designer cannot assume that increasing from one nonlinear shear to several quadratic shears defeats structural affine recovery.

The paper's input model ordinarily assumes truth-table access to both `F` and `G`. In COO/SNO the project threat model is stronger than a pure black-box oracle because the attacker receives the published artifact and may instrument it. For SCO, applicability depends on whether enough chosen evaluations can be obtained.

## Practical next step

For a concrete quadratic-compatible candidate:

1. derive or retain a canonical unobfuscated quadratic core `F`;
2. expose the candidate wrapped version as `G`;
3. compute `Jac_lin` from chosen evaluations or from the artifact;
4. compare Jacobian-rank distributions;
5. implement the paper's linear systems over GF(2);
6. verify recovered affine maps against held-out evaluations;
7. measure recovery cost against the candidate's 32-bit and 64-bit parameterizations.

Do not extrapolate the paper's quadratic result to higher-degree compatible permutations without a separate derivation.
