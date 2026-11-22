# Independent peer review of universally singular coordinate bases

**Reviewer:** Agent 50. **Date:** 22 November 2026. **Classification:** independent intermediate mathematical review, not an established obfuscation-security result.

## Disposition

I found **no counterexample or arithmetic error** in Agent 2's four requested claims. A separate deterministic Python implementation, which imports none of the repository's reanchor code, reproduced the finite-width counts, both explicit witnesses, and the general common-basis lemma's exhaustive width-three checks.

The review confirms the intended narrow boundary: changing the anchor while keeping the external coordinate directions fixed can fail for every anchor; an invertible interpolant can still violate the hidden compatible-basis condition; and the general rank-only common-basis lemma is existential, not an efficient black-box basis-discovery algorithm. None of these findings establishes inversion hardness or a security improvement for the obfuscator.

## Independent implementation and reproduction

The standalone checker is `sims/reanchor-agent2-independent-peer.py`, added at commit `c0acec777b2ae6f2aa87880b26dd7d414174ef52`. It enumerates truth-table maps and performs direct GF(2) operations; it does not import Agent 2's implementations. Reproduce with:

```sh
python3 sims/reanchor-agent2-independent-peer.py
```

Observed local environment: Python 3.13.5; deterministic execution completed in approximately 3.6 seconds. No random sampling or external package was used. This independent checker was not dispatched to CI; Agent 2's original executable fixtures retain their separately reported two-platform runs.

## Findings

### 1. Universal singularity of the three-bit external-coordinate interpolant

The explicit construction is a permutation: both component maps are involutions, and the composition is inverted by applying them in reverse order. For all eight anchors, the three coordinate-difference columns XOR to zero and have rank exactly two. The independent checker also embedded the construction into 32 bits and verified at eleven representative anchors that the first three columns remain dependent while columns 3 through 31 are the corresponding identity columns.

At the three-bit anchors, the independently observed columns are:

| Anchor | M_r(e_0), M_r(e_1), M_r(e_2) |
|---:|---|
| 0 | 5, 6, 3 |
| 1 | 5, 2, 7 |
| 2 | 1, 6, 7 |
| 3 | 1, 2, 3 |
| 4 | 1, 2, 3 |
| 5 | 1, 6, 7 |
| 6 | 5, 2, 7 |
| 7 | 5, 6, 3 |

The witness is dimension-minimal in this class. Independent exhaustive checks of all width-one and width-two compatible permutations, affine input maps and anchors covered 4 and 192 cases respectively; every interpolant was full rank, compatible, and anchor-independent. This agrees with the direct argument that every width-two triangular permutation is affine.

The hidden input basis does repair the witness: directions `[1,2,7]` produce native output differences `[5,6,4]`, a lower-unitriangular matrix. This is an existence check using the hidden basis, not a method for discovering it from an oracle.

### 2. The 64 × 24 width-three census

The independent exhaustive census enumerated all 168 matrices in `GL(3,2)`, all 128 compatible permutations, and all eight anchors for each of the 21,504 source pairs: 172,032 anchor checks.

| Classification | Source pairs | Anchor matrices |
|---|---:|---:|
| Compatible at all eight anchors | 19,968 | 159,744 |
| No compatible anchor | 1,536 | 12,288 singular matrices |
| Mixed | 0 | 0 |

The analytic count also reproduced independently. The top-bit quadratic coefficient alpha is the parity of the four values in its two-input truth table; exactly 64 compatible permutations have alpha = 1. For the input matrix, exactly six ordered independent first-row pairs—(3,5), (3,6), (5,3), (5,6), (6,3), (6,5)—satisfy the determinant-flip condition: the GF(2) dot product of (a0 AND a1) with v is 1, where v is the unique nonzero vector orthogonal to a0 and a1. Each pair has four admissible third rows, giving 24 bad invertible matrices. Therefore the exact count is 64 × 24 = 1,536.

This agrees with Agent 2's reported classification and explains why the width-three family has no mixed-anchor cases.

### 3. The four-bit full-rank-but-incompatible witness

The independent implementation confirms all 16 source and output values are distinct, the output map is compatible triangular, and the input map is invertible. Across all 16 anchors it found eight singular matrices, eight full-rank matrices, and **zero** matrices whose normalized B_r = M_r A^-1 is lower-unitriangular.

At anchor 11:

- M_r columns: [3, 10, 5, 4]
- normalized B_r columns: [15, 10, 8, 12]
- target F(1) = 5
- fixed-point trajectory: 14 -> 6 -> 9 -> 14, with none of those inputs mapping to 5.

The same target is reached accidentally from anchors 0 and 3. This is a useful nuance: the example falsifies “full rank is sufficient” and shows the specified update can cycle, but it does not show that every anchor or every inversion method fails.

### 4. General common-basis lemma

The proof is valid. With g(u) = F(r XOR u) XOR F(r), if the current input and output spans U and W both have dimension k < n, a next direction is forbidden only if it lies in U union g^-1(W). Both sets have size 2^k and contain zero, so their union has at most 2^(k+1) - 1 < 2^n elements. A direction outside the union increases both dimensions. Induction gives a basis whose output differences also form a basis.

An exhaustive check covered all 40,320 permutations of an eight-element domain at all eight anchors: **322,560 permutation-anchor pairs, zero failures**.

The construction is not an efficient oracle algorithm as written. Finding the next direction by scanning candidates may require access to the complete finite truth table; the proof supplies no polynomial query bound, and the exhaustive check does not establish one. It also guarantees only full rank, not the hidden compatible-normalization property required by Agent 20's conditional inversion theorem.

## Relation to the conditional inversion theorem

These results do not contradict Agent 20's theorem. Its premise is that the source-normalized observed matrix is an invertible compatible linear map. Agent 2 demonstrates that this premise is not guaranteed by choosing a different anchor in the fixed external coordinate basis, and that nonsingularity alone cannot replace the premise.

The three-bit example is directly reversible when its construction is known. The four-bit example is a counterexample to a particular fixed-point convergence argument under a failed premise, not a lower bound against other attacks. The common-basis lemma leaves open whether a useful basis can be found with a bounded chosen-query budget.

## Conclusion

All four requested claims are independently supported within their stated scope. I recommend retaining Agent 2's report as intermediate mathematical evidence, with its current cautious wording. Do not promote it as a general oracle lower bound, an obfuscation-security result, or evidence that a defender gains protection from the failed reanchoring strategy.
