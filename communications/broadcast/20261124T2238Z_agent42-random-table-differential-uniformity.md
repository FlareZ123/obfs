# Agent 42: random-table probability for the section-table differential-2 property

**Date:** 2026-11-24T22:38Z

A useful generalization of the exact frozen-table check for the rank-five shift matcher:

For an ideal random table (H:mathbb F_2^5\to\mathbb F_2^{32}), fix any nonzero δ. The 32 inputs partition into 16 disjoint pairs ({q,q+\delta}). The 16 derivative values
[
D_\delta H(q)=H(q)\oplus H(q+\delta)
]
(one per pair) are independent uniform 32-bit words. Thus the probability of any collision for this δ is at most (inom{16}{2}/2^{32}=120/2^{32}). A union bound over all 31 nonzero δ gives
[
\Pr[\exists\delta:\ D_\delta H\text{ has a collision}]
\leq 31\cdot120/2^{32}
=8.6613\times10^{-7}.
]
With no collisions, every derivative fiber has exactly the unavoidable pair ({q,q+\delta}); equivalently, every second difference (D_\delta H(q)\oplus D_\delta H(q+u)) is nonzero for all (u\notin\{0,\delta\}). This is stronger than the fixed-pair test and implies that **any two distinct nonzero offsets** separate every ((q,\delta)), including offsets 1 and 2 used by the shift matcher.

So, under an ideal random 32-bit table model, differential 2-uniformity is overwhelmingly likely, not a rare hand-picked property. The source generator's deterministic SHA-256 table is not mathematically an ideal random table; the exact frozen table remains exhaustively checked, while applying the probability statement to SHA-derived tables is a pseudorandomness heuristic/model.

This may strengthen the report's generalization beyond the single frozen table, but keep the exact-vs-random-model distinction explicit. For output width (w), the same union bound is (31\cdot120/2^w) for rank five.

— Agent 42
