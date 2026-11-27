# Exact fixed-pair separation for the frozen rank-five source table

**Date:** 2026-11-24  
**Status:** deterministic, exhaustive source-specific table result; not a production learner or HTTP validation.

## Result

The exact private table used by PR #373 satisfies Agent 43's fixed-pair section-table separation condition for **every possible ordered pair of independent first-two anchor directions**, not merely for random anchors.

The reproduction script is `sims/agent2-rankfive-fixed-pair-exhaustive.py`. Run:

```sh
python3 sims/agent2-rankfive-fixed-pair-exhaustive.py
```

It reconstructs the table and source string directly from the frozen `privateSource()` generator in `sims/sco-rankfive-arbitrary-table-real-http.js` at code head `63f2a5bc2a74a988cd3e65b11c11ac642ec10c09`. It asserts:

- the five projection masks have GF(2) rank 5;
- the table's full XOR/top quintic coefficient is `0xb1f2257d`;
- the reconstructed source string has SHA-256 `2b6a7b2cb348cd716e636e8e2da0817d4721a95f98bd45bbd90ffd8a5b366a9d`, length 3,487 bytes.

It also checks differential uniformity directly: for each nonzero delta, the 32 derivative values H(q) XOR H(q+delta) contain exactly 16 distinct 32-bit words, each occurring twice. This is differential uniformity 2 for the vectorial function H:F2^5 -> F2^32, the smallest possible value when output dimension is at least input dimension. Carlet's terminology reserves “APN” for equal input/output dimensions, so this report uses “differentially 2-uniform.” See Claude Carlet, *Boolean Functions for Cryptography and Coding Theory*, §3.4.1, pp.157–160: https://www.math.univ-paris13.fr/~carlet/book-fcts-Bool-vect-crypt-codes.pdf .

It first checks the stronger property directly: for every basepoint q, every nonzero shift delta, and every offset u other than 0 or delta, the second difference

`H(q) XOR H(q+delta) XOR H(q+u) XOR H(q+u+delta)`

is nonzero. Thus the only zeros of the function u -> D_u D_delta H(q) are the unavoidable u=0 and u=delta. It checks 32 × 31 × 30 = 29,760 nontrivial triples.

It then independently enumerates every ordered pair u,v of distinct nonzero vectors in F2^5. Over F2, these are exactly the 930 ordered independent pairs. For each pair it checks every basepoint q in F2^5 and every nonzero shift delta, verifying that at least one of D_u D_delta H(q) and D_v D_delta H(q) is nonzero.

**Result:** zero violations.

**Exhaustive counts:** 992 derivative-value checks (32 basepoints × 31 nonzero deltas), 29,760 nontrivial second-difference triples, plus 930 ordered independent offset pairs × 32 basepoints × 31 nonzero shifts = 922,560 fixed-pair constraints; all passed.

Under an iid-uniform 32-bit table model, each nontrivial second difference XORs four distinct independent table words and is zero with probability 2^-32. A union bound over 29,760 triples gives a failure probability at most 29,760/2^32 ≈ 6.93×10^-6. This explains why the SHA-derived table is likely to have the property, but is only a random-table heuristic; the exhaustive checks above establish it for the frozen table itself.

## Why this covers every anchor basis

For any quotient-basis anchors a0,...,a4, the first two projected anchor vectors u=P(a0) and v=P(a1) are distinct nonzero vectors in F2^5, hence independent. Conversely, every ordered independent pair can be extended to a full basis. The enumeration therefore covers the first-two-coordinate pair of every possible invertible anchor-coordinate transformation.

The section table is H(t)=A(s(t))+b+h(Mt), where M is the invertible coordinate map induced by the anchors. The affine term A(s(t))+b vanishes under second differences, so the checked property for h(Mt) is exactly the property used by the shift matcher. Differential uniformity 2 means that, for fixed nonzero delta, D_delta H(q+u)=D_delta H(q) only when u is 0 or delta. If both distinct nonzero offsets u and v failed to separate, both would have to equal delta, which is impossible. Thus, for this frozen source table, the fixed pair {1,2} passes regardless of which valid witness anchors are selected.

## Implication and limits

For this exact source, once a nonzero rank-five witness is found, the three-probe shift matcher is guaranteed to recover each standard-basis quotient coordinate uniquely under the projected-affine promise. The random-table union bound is not needed for this source-specific conclusion. Within this translated-table matching scheme, three probes per basis vector are minimal: with only one nonzero offset u, the false shift delta=u always gives D_u D_delta H(q)=0, so q and q+u cannot be distinguished.

This supports a conditional fast-path cap of 2,497 queries with lazy witness faces and 726 verification samples, or 2,524 with the current eager six-cube witness prefetch. The current PR #373 learner does not yet implement the shift matcher; these are prospective caps, not observed HTTP counts. A no-witness event still requires fallback, and out-of-promise sources still require the independent RM verifier and exact ANF fallback.

This result does **not** establish the fixed-pair property for arbitrary tables, arbitrary JavaScript, other source families, or all ranks. It does not validate a production Node learner, browser/peer/HTTP workflow, CSPRNG failure probability, CPU cost, or the 2.5× runtime requirement. Keep it in `im-results/`.
