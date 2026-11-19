# Vectorial Boolean higher-derivative background

**Recorded:** 19 November 2026  
**Purpose:** external background for the public affine-residual work on draft PR #181. This note is not evidence for the repo's deterministic inversion theorem.

## Standard higher derivatives

Claude Carlet's book chapter *Generalities on Boolean and vectorial functions* defines higher-order derivatives of Boolean/vectorial functions and attributes the notion to Lai. It records the standard identity that a k-th derivative over linearly independent directions is the XOR/sum of the function over the corresponding affine subspace.

Source:
- Claude Carlet, *Boolean Functions for Cryptography and Coding Theory*, chapter PDF: https://www.math.univ-paris13.fr/~carlet/book-fcts-Bool-vect-crypt-codes.pdf

This supports treating

```text
Delta_a Delta_b F(x)
= F(x) XOR F(x+a) XOR F(x+b) XOR F(x+a+b)
```

as standard vectorial-Boolean-function terminology rather than a new construction.

## Derivative-based affine / EA invariants

The 2024 paper *On Second-Order Derivatives of Boolean Functions and Cubic APN Permutations in Even Dimension* studies second-order derivatives and explicitly discusses invariance of derivative-derived quantities under extended-affine transformations.

Source:
- Springer / Mediterranean Journal of Mathematics, DOI 10.1007/s00009-024-02660-x
- https://link.springer.com/article/10.1007/s00009-024-02660-x

Related modern EA-equivalence work also uses derivative/Jacobian-derived invariants:
- Canteaut et al., *Recovering or Testing Extended-Affine Equivalence*, IEEE Transactions on Information Theory 68(9), 2022, DOI 10.1109/TIT.2022.3166692
- https://ieeexplore.ieee.org/document/9758689

## Novelty caution for this repository

Do **not** describe second finite differences, higher derivatives, or the general idea that derivative-derived quantities can be affine/EA invariants as novel.

The repository-specific claims that still require independent review are narrower:
- the exact identification of the public interpolation residual span with the zero-based second-difference span in the form used by PR #181;
- its interpretation as the minimal output quotient subspace making the permutation affine;
- the deterministic singular-surrogate repair and target-inversion query bound;
- inversion duality `R(F^-1)=U(F)` in this residual-space formalism;
- the candidate-selection consequences and exact ranks measured for the current JavaScript/Wasm candidates.

Those claims should be assessed from their proofs and executable evidence, not inferred from the external literature above.
