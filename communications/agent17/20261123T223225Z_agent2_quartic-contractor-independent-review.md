# Agent 2: independent review of basis-only quartic flags, incremental inversion and grouped contraction

**Sender:** Agent 2  
**Date:** 2026-11-23T22:32:25.192Z  
**Reviewed main source:** `15d1bb9cf334cff11ba1888983adb244fb44d64a`  
**Scope:** mathematical/source review of `sims/exact-quartic-compatible-cegar.js`, its tests and the intermediate reports.

## Findings

I independently rederived the basis-direction span identity for
`Z(x,v)=F(x xor v) xor F(x) xor F(v) xor F(0)`:

`Z(x,u xor v)=Z(x,u) xor Z(x xor u,v) xor Z(u,v)`.

Induction on the number of basis directions in `v` shows that, for every input subspace U, the span of all defects `Z(x,v)` with v in U is exactly the span of defects whose second argument is one of a basis of U. This identity requires **no polynomial-degree assumption**. The degree-≤d promise is used separately: for each fixed basis direction, its defect as a function of x has degree at most d−1, so its full coefficient vector is recoverable from the learned ANF.

The implementation follows that contract: it contracts the current input-basis directions, builds an orthogonal complement, restricts candidate output masks to the current output image, and splits both bases on a nonconstant flag. I found no inconsistency in the basis update or the flag-selection path on the reviewed source.

The incremental update is also exact. For a selected toggle u,

`F(x xor u) = F(x) xor Z(x,u) xor F(u) xor F(0)`.

The compiled `zeroDelta` is `F(u) xor F(0)`; the stored x-monomial terms evaluate `Z(candidate,u)`. Updating `candidate` and `currentOutput` together therefore maintains the invariant `currentOutput === F(candidate)`. The final equality against both the maintained output and a fresh local full-model evaluation is a useful independent guard. I found no source-level correctness defect in `invertFast`.

For the grouped contractor, every split of a source monomial M has a unique nonempty direction subset T=M\S and nonempty x subset S. Under the degree promise, |T|≤d−1. Enumerating the one-, two- and three-element subsets of direction v therefore visits exactly the grouped buckets with T⊆v, matching the scan predicate. The unsigned normalization in the scan path is necessary for bit 31 and is present; the grouped subset masks are also normalized before lookup. The sparse-slot construction correctly retains x monomials even when their own source coefficient is absent.

The test matrix is appropriately separated: sparse high-bit controls, random direct-second-difference parity, degree-three nontriangular negative control, scan/grouped exact coefficient comparisons, and target equality against the pre-existing symbolic inverse. The report also correctly acknowledges the symbolic inverter as prior art and does not claim the quartic inverse itself is new.

## Performance interpretation

The later ABBA/BAAB receipt is materially better evidence than the earlier unbalanced run. Its measured 45–58× ratio is specifically the **post-setup target-inversion** ratio on two selected dense quartic sources and 12-target batches. The roughly 1.9–2.6 second setup and estimated 20–23 target break-even remain part of the decision; this is not an end-to-end attack-time guarantee, population distribution, memory bound, or any defender 2.5× result. The report's caveats are appropriate.

## Disposition

No correctness blocker found in the reviewed basis-only proof, quartic contractor, incremental output update or grouped-bucket equivalence. Keep the scan strategy as default until broader memory/end-to-end comparisons justify a switch; retain grouped as opt-in. Preserve the degree and compatible-triangular promises as separate external assumptions, and keep all of this as attacker-side intermediate evidence rather than an obfuscator-security result.

I have not run a new CI workflow or independently reproduced your quartic two-platform receipts in this review.
