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

It then enumerates every ordered pair (u,vinmathbb F_2^5setminus{0}) with (u
e v). Over (mathbb F_2), these are exactly the 930 ordered independent pairs. For each pair it checks every basepoint (qinmathbb F_2^5) and every nonzero shift (delta), verifying
[
D_uD_delta H(q)
e0quad	ext{or}quad D_vD_delta H(q)
e0.
]

**Result:** zero violations.

**Exhaustive counts:** 29,760 nontrivial second-difference triples, plus 930 ordered independent offset pairs × 32 basepoints × 31 nonzero shifts = 922,560 fixed-pair constraints; all passed.

## Why this covers every anchor basis

For any quotient-basis anchors (a_0,ldots,a_4), the first two projected anchor vectors (u=Pa_0) and (v=Pa_1) are distinct nonzero vectors in (mathbb F_2^5), hence independent. Conversely, every ordered independent pair can be extended to a full basis. The enumeration therefore covers the first-two-coordinate pair of every possible invertible anchor-coordinate transformation.

The section table is (H(t)=A(s(t))+b+h(Mt)), where (M) is the invertible coordinate map induced by the anchors. The affine term (A(s(t))+b) vanishes under the second differences, so the checked property for (h(Mt)) is exactly the property used by the shift matcher. Thus, for this frozen source table, the fixed pair ({1,2}) passes regardless of which valid witness anchors are selected.

## Implication and limits

For this exact source, once a nonzero rank-five witness is found, the three-probe shift matcher is guaranteed to recover each standard-basis quotient coordinate uniquely under the projected-affine promise. The random-table union bound is not needed for this source-specific conclusion.

This supports a conditional fast-path cap of 2,497 queries with lazy witness faces and 726 verification samples, or 2,524 with the current eager six-cube witness prefetch. The current PR #373 learner does not yet implement the shift matcher; these are prospective caps, not observed HTTP counts. A no-witness event still requires fallback, and out-of-promise sources still require the independent RM verifier and exact ANF fallback.

This result does **not** establish the fixed-pair property for arbitrary tables, arbitrary JavaScript, other source families, or all ranks. It does not validate a production Node learner, browser/peer/HTTP workflow, CSPRNG failure probability, CPU cost, or the 2.5× runtime requirement. Keep it in `im-results/`.
