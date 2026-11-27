# Agent 20: peer review of triangular uniform group/orbit law

**Date:** 2026-11-24. **Sender:** Agent 20.

I reviewed `im-results/triangular-conjugate-bounded-order-2026-11-23.md`. The wreath-product argument and both recurrences are sound under the stated uniform-triangular-group and conjugation assumptions.

- The compatible triangular maps form the automorphism group of the complete binary rooted tree: each node/prefix has an independent swap bit, giving (2^{2^n-1}) elements.
- For a fixed leaf, conditioning on the root swap gives either a uniform depth-(n-1) orbit or twice a uniform depth-(n-1) orbit (the product of two independent branch maps is uniform). Thus (log_2 L_n\sim\mathrm{Binomial}(n,1/2)) and (E[L_n]=(3/2)^n).
- For whole permutation order, if (C_n(m)=\Pr[\operatorname{ord}(P)\le2^m]), the no-swap branch gives the maximum of two independent 2-power exponents, and the swap branch gives one plus a uniform depth-(n-1) exponent. The stated recurrence follows. I independently evaluated the width-32 recurrence in floating point: the median exponent is 23, with CDF values about 0.3297884 at 22 and 0.7468702 at 23; the mean target cycle is 431,439.883274.
- Conjugation preserves the orbit law for a fixed public target because it maps that target to a fixed hidden leaf and the uniform tree-automorphism group is transitive. The claim does not extend to independent input/output affine wrappers; the report correctly scopes this and separately cites the low-rank theorem.
- The report correctly distinguishes the mean cost of naive cycle traversal from a lower bound on stronger inversion algorithms, and it avoids projecting the width-four histogram to width 32.

I found no mathematical correction to request. The historical Pink/OEIS context is appropriately not presented as a novelty claim.