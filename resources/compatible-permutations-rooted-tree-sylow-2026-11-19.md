# Compatible permutations as rooted-binary-tree automorphisms

**Captured:** 19 November 2026 by Agent 2.  
**Use:** structural model for the compatible-permutation attack lane. Historical group-theoretic facts are externally sourced; consequences for the obfs oracle model are derived locally and should be validated before promotion.

## External group-theoretic fact

A complete rooted binary tree of depth `n` has `2^n` leaves. Its automorphism group is the `n`-fold iterated wreath product of `C_2`, obtained by independently swapping the two children below each internal node.

Useful sources:

- Riccardo Aragona et al., *Rigid commutators and a normalizer chain*, §2, which describes the Sylow 2-subgroup of `Sym(2^n)` through automorphisms of the depth-`n` binary tree:
  https://link.springer.com/article/10.1007/s00605-021-01514-y
- Aliniaeifard et al., *Natural Transformations between Induction and Restriction on Iterated Wreath Product of Symmetric Group of Order 2*, which explicitly identifies the iterated wreath product with the complete binary-tree automorphism group and as a Sylow 2-subgroup of the symmetric group:
  https://www.mdpi.com/2227-7390/10/20/3761

The order obeys

```text
|T_n| = 2 |T_(n-1)|^2
      = 2^(2^n - 1).
```

Legendre's formula gives `v_2((2^n)!) = 2^n - 1`, so this is the full 2-part of the symmetric-group order.

## Exact correspondence with compatible permutations

For the repository, an `n`-bit permutation `P` is compatible when every congruence modulo `2^k` is preserved.

Read a word from its least-significant bit upward. The residue modulo `2^k` is exactly the length-`k` prefix in that ordering. A compatible permutation therefore preserves every level of the rooted binary partition tree.

Equivalently, every compatible permutation has triangular bit form

```text
y_0 = x_0 XOR f_0
y_1 = x_1 XOR f_1(x_0)
...
y_k = x_k XOR f_k(x_0,...,x_(k-1))
...
```

with one arbitrary Boolean child-swap function per tree level/node. Conversely, every such collection of conditional child swaps is a rooted-tree automorphism and preserves all low-bit congruences.

Therefore the repository's full compatible-permutation family is exactly a concrete Sylow 2-subgroup of `Sym(2^n)`, under the low-bit-first leaf labeling.

## Consequence for the two-sided wrapper model

For

```text
F(x) = L_out(P(L_in(x))),
```

the linear maps hide the input and output leaf labelings of the same binary block tree.

The deepest nontrivial input block has direction

```text
u = L_in^-1(e_(n-1)),
```

and the corresponding output block has direction

```text
w = L_out(e_(n-1)).
```

Every compatible permutation swaps or preserves the two leaves inside each deepest pair consistently as a pair, which gives the exact global translation identity

```text
F(x XOR u) = F(x) XOR w
```

for every `x`.

Quotienting by the actual pair directions `span(u)` and `span(w)` removes the deepest tree level. The induced quotient permutation is again a two-sided linearly relabeled compatible permutation on `n-1` bits. This gives a recursive structural interpretation of the inversion problem.

## Important attack boundary

The structural identity does not by itself give a polynomial-query exact black-box method for recovering `u`.

The sparse two-sided construction in

```text
im-results/two-sided-sparse-certification-lower-bound-2026-11-19.md
```

shows why global certification can be expensive: a candidate can differ from a linear baseline on one hidden two-point leaf pair. Exact deterministic certification against all such candidates needs `2^(n-1)` queried inputs, even though target inversion for that same sparse family is easy once its baseline and pair direction are known.

Accordingly, birthday/differential searches for the hidden pair direction are useful empirical attack ideas, while a worst-case exact claim requires a separate target-directed argument.

## Relation to standard block-system algorithms

Classical permutation-group algorithms can recover blocks of imprimitivity efficiently when the input is a group represented by explicit generating permutations. For example:

- M. D. Atkinson, *An Algorithm for Finding the Blocks of a Permutation Group*, Mathematics of Computation 29(131), 1975:
  https://doi.org/10.1090/S0025-5718-1975-0367030-3

That input model is materially stronger than the repository's black-box setting. Here the attacker receives evaluations of one unknown permutation `F`; it does not receive a generating set for the hidden tree-automorphism group or a table of all `2^n` images. Standard block algorithms therefore motivate structure-aware attacks but do not directly solve the chosen-query problem.

## Research use

This viewpoint suggests three separate lanes:

1. target-directed recovery of hidden tree blocks, avoiding global certification;
2. empirical meet-in-the-middle/differential recovery of the deepest translation symmetry on dense nonlinear families;
3. source/runtime attacks that recover the explicit linear labelings directly when the published JavaScript exposes them.

The third lane remains especially important for COO/SNO, where the project threat model grants source/runtime observation. Any black-box hardness result should be treated as an attacker handicap unless the corresponding internals are genuinely withheld.
