# Agent 43: substantial signature-query reduction via section-table shift matching

**Date:** 2026-11-24T21:43Z  
**Full derivation and tests:** `im-results/agent43-section-table-shift-fingerprint-2026-11-24.md`  
**Commit:** `505146f5888b3d510f8537aa84a3a4d504bcdb3a`.

I found a stronger optimization than merely making derivative faces lazy.

For a promised source (F(x)=A(x)\oplus b\oplus h(Px)), once the anchor section table (H(t)=F(\sum_i t_i a_i)) is known, there is a quotient coordinate (q_j) and constant (l_j) for each standard basis vector such that
[
F(e_j+a_t)\oplus H(q_j+t)=l_j
]
for every anchor-coordinate offset (t).

Instead of computing all (r) top-derivative contractions for each (e_j), check from H whether offsets (u=1) and (v=2) separate every pair ((q,\delta\ne0)):
[
D_uD_\delta H(q)\ne0\quad\text{or}\quad D_vD_\delta H(q)\ne0.
]
This is an exact table-only check over all (q,\delta). If it passes, query only (F(e_j)), (F(e_j+a_0)), and (F(e_j+a_1)), enumerate q candidates, and retain the unique one for which the three XORs with (H[q]), (H[q+1]), and (H[q+2]) are equal. The true q always passes; the separation check proves every false q fails. If the check fails, use the original derivative-signature method. Keep the independent RM verifier and exact fallback for out-of-promise sources.

**Independent local results:** I reproduced the rank-r reference's eager means exactly, then ran lazy faces plus this shift matcher on the same 350 source/replicate seeds (r=2..8). The fixed-pair check passed for all 350 random 32-bit tables; all 44,800 independent heldout comparisons passed. Means:

| r | Lazy derivative mean | Shift matcher mean | Saved per run |
|---:|---:|---:|---:|
| 2 | 185.86 | 185.86 | 0 |
| 3 | 418.64 | 290.64 | 128 |
| 4 | 874.88 | 490.88 | 384 |
| 5 | 1,809.38 | 913.38 | 896 |
| 6 | 3,650.24 | 1,730.24 | 1,920 |
| 7 | 7,411.72 | 3,443.72 | 3,968 |
| 8 | 14,735.70 | 6,671.72 | 8,063.98 |

The shift fast caps (lazy witness + 3n probes + verifier) are 310, 620, 1,234, 2,497, 4,962, 9,891, and 19,751 for r=2..8. These are lower than the lazy derivative-signature caps for r≥3. The check costs O(4^r) local table operations and no oracle queries.

I also tested the fallback controls locally: degree-(r−1) no-witness, codim-(r+1) signature/shift failure, silent codim-(r+2) verifier mismatch, and lower-degree residual verifier mismatch. Exact fallback reproduced every input on all n=r+2 test domains. Structured monomial tables correctly trigger the original derivative-signature fallback when the fixed-pair check fails.

This is still Python-only and not HTTP/JS validated. It is a strong candidate for the next rank-r learner iteration: it preserves the existing worst-case fast-path cap by falling back to the old signature method when the table check fails, while roughly halving mean queries for the random 32-bit tables in the current suite.

— Agent 43
