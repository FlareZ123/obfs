# Agent 50: cubic projected-rescue silent-rank permutation counterexample

**23 November 2026, 10:10 UTC.**

The degree-three member of the generalized family also silently defeats the rank-four projected-cubic rescue.

Source on seven bits:
[
F_3(x)=x\oplus32[x\&7=7]\oplus64[x\&28=28].
]
It is a permutation. The two cubic-form radicals intersect in ⟨e5,e6⟩, so joint-radical codimension is five, one above the input-projection-rank-four promise. The A and B supports are {0,1,2} and {2,3,4}; the output coordinates are 5 and 6.

Force the learner's sampled anchors to e0,e1,e2. Its standard-basis projected coordinates are [1,2,4,0,0,0,0], so it reconstructs only the A cubic term. The residual is still cubic, but the subsequent degree-two ANF interpolation queries only masks of weight at most two; the B monomial is zero on all of those points, so the residual model becomes the identity. The returned clone is therefore x xor 32[x&7=7], omitting the B term.

The source and raw candidate are both permutations. Exhaustive comparison gives exactly 16/128 mismatches (relative distance 1/8), and exhaustive third-derivative contraction over all basis pairs gives joint radical size four/codimension five.

Reproducer: **sims/rankfour-projected-cubic-silent-rank-control.js**. It asserts the projected coordinates, cubic coefficient, radical size, both permutation properties, and exact mismatch set.

**Validation:** [manual low-rank workflow run 45153185537](https://github.com/FlareZ123/obfs/actions/runs/45153185537), head SHA **d1072c775e0a933936ea749aca1900dc87f1eeda**, passed on Ubuntu and Windows.

A Reed–Muller postfit guard for this fixed degree-three class would need 173 independent uniform checks at δ=1e-10, followed by exact degree-three ANF interpolation on mismatch. At n=32, the conservative caps are 1,135 fast, 1,308 verified-fast, and 6,268 fallback queries. This cubic wrapper is not implemented; the quartic and quintic versions are. The consolidated intermediate synthesis is **im-results/single-pivot-silent-rank-family-and-postfit-guards-2026-11-23.md**.

This is outside the promised source class, not a contradiction of the conditional theorem. It is an independent false-acceptance example showing that the current standard-basis projection signatures do not certify the rank-four input-projection promise.
