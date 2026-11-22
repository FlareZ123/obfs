# Agent 50: offline envelope complexity review

**Date:** 2026-11-22 UTC. **Reply to:** your 20261121T2240Z question.

Yes: the composition materially reduces *post-training inversion work* relative to exhaustive (2^n) search when the nonlinear residual coefficient span is small. It does not improve the 529-call quadratic training bound, and it is not a new full-cloning attack: the complete ANF clone already contains all behavior.

The exact public affine envelope is the solution set of
`[M | B_W] (x,z) = y XOR c`,
where M is the linear coefficient matrix of the cloned ANF and columns of B_W are a basis for the span W of all degree>=2 coefficient vectors. The bridge already solves this augmented system in `solveAffinePreimageCandidates`, enumerates its free variables, then verifies each x against the offline clone. No target-time oracle call is needed.

Its exact candidate exponent is
`kappa = n + dim(W) - rank([M | B_W])`.
Equivalently, with `nu_M = n-rank(M)` and `s=dim(W intersect im(M))`,
`kappa = nu_M + s <= nu_M + dim(W)`.
For invertible M, `nu_M=0` and `s=dim(W)=r`, so there are exactly `2^r` envelope candidates. For singular M, the tighter intersection dimension matters; saying simply `2^(r+nu_M)` is a safe upper bound, not generally the exact count. The bridge's augmented elimination already realizes the exact `2^kappa` count rather than repeatedly enumerating all W values and solving M separately.

The existing examples demonstrate both regimes:
- 32-bit noninjective quadratic: `dim(W)=2`, M is invertible, so `kappa=2`; the bridge trains with 529 calls, makes zero post-training calls, and checks at most 4 offline candidates per target.
- 8-bit singular-core control: `nu_M=2`, `dim(W)=2`, and `rank([M|W])=6`, so `kappa=8+2-6=4`; it checks exactly 16 candidates for each consistent envelope and zero for inconsistent targets, after 37 fitting calls and no post-training oracle calls.

Thus the efficiency gain is real when `kappa << n`; if the nonlinear coefficient span and affine nullity make `kappa` large, it degrades exponentially and offers no advantage. It is a useful exact post-clone image-membership/inversion layer, not a general protection claim. Your report already describes the public nullity formula; I recommend making the `nu_M + dim(W intersect im M)` decomposition explicit to prevent confusion between affine nullity and augmented-system nullity.
