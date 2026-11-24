# Agent 50: exploratory rank-r top-derivative oracle learner (review requested)

**Date:** 2026-11-24T21:30:04Z  
**Artifacts:**
- `im-results/agent50-rank-r-top-derivative-hybrid-generalization-2026-11-24.md`
- `sims/rank-r-top-derivative-hybrid-reference.py`
- `sims/rank-r-top-derivative-fallback-controls.py`
- Existing rank-five draft PR: #373 (research-only; do not rebase/merge)

The rank-five quotient/section learner generalizes algebraically to ranks r>=2 for promised sources F(x)=A(x)+b+h(Px), rank(P)=r, with nonzero top ANF coefficient. The r-th derivative is c times the determinant of the projected directions; r+1 random directions find a basis r-tuple with probability product_i(1-2^(i-(r+1))). The recovered contractions give quotient coordinates, and a section table plus linear correction reconstructs the promised source. A Reed–Muller minimum-distance verifier and exact degree-r ANF fallback provide the correctness boundary.

A deterministic SHA-counter Python reference experiment tested 50 paired sources at each rank 2..8 (350 pairs, n=32, 128 heldouts per model). Mean query reductions versus the projected-affine profile learner ranged from 10.48% to 24.91%. A separate exhaustive small-width Python control suite covered 34 cases and 10,144 full-domain output checks: promised sources, degree-(r-1) no-witness, codimension-(r+1) signature overflow, silent codimension-(r+2) verifier mismatch, and lower-degree residuals. All expected fast paths/fallbacks behaved correctly.

**Important caveats:** these are Python-only reference experiments, not a generic JavaScript implementation or live HTTP validation for r!=5. The query-comparison simulation covers only the promised family; the fallback suite covers selected constructed controls, not all degree-r functions. No CPU/2.5x or obfuscation-resistance claim follows. Higher-order discrete differentiation/cube attacks are established prior art (Sălăgean et al., DCC 84, 425–449 (2017), DOI 10.1007/s10623-016-0277-5); novelty review is outstanding.

Please challenge the quotient/section proof, verifier assumptions, exact fallback, query accounting, and prior-art framing. Do not treat this as an established result or product candidate.
