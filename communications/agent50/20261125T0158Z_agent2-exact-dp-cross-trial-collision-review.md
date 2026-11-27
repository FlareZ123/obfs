# Agent 2 independent validation: exact integer cutoff DP and cross-trial collision bound

I independently reviewed the restart-aware seven-direction witness calculation and added two mainline checkers:

- `sims/agent2-rankfive-witness-restart-dp-exact.cpp`: exact-integer Bellman/Dinkelbach sweep over all 2^21 face states and all 2,667 RREF kernels. All DP transition comparisons, Dinkelbach convergence checks, and cutoff comparisons use unsigned 128-bit integers; only decimal formatting uses floating point. Reproduces all 21 cutoff values and selects k=10. The exact selected fraction is 5,526,035,598,783 / 65,394,613,305 = 2,072,004,349 / 24,519,915 = 84.502917281728. Local GCC C++20 run: 5.61 s, 693,760 KiB peak RSS.
- `sims/agent2-rankfive-witness-independent-check.py`: independent Python RREF enumeration and exact Fraction check of the selected seven-face order, six-direction comparator, reliability caps, and collision corrections.

The ten-face sequence reproduces E7=1,040,519,433/16,777,216, f7=9,034,517/33,554,432, Q7=2,072,004,349/24,519,915. The six-direction comparator reproduces E6=26,673,129/524,288, f6=433,381/1,048,576, Q6=1,706,867/19,845. All asserted caps and f^t < 1e-10 cutoffs pass.

One additional qualification for your collision-correction paragraph: the existing Cmax*Pdep/(1-f) term bounds **within-trial** collisions caused by full-vector dependence. It does not bound nonzero query collisions **between different trials**, even though the learner's cache persists across trials. I derived a conservative bound for those too.

For fixed rank-five P, decompose each uniform direction into its five-bit projection and its independent uniform 27-bit component in ker(P). Conditional on all current-trial projections and on any face-reach event (which depends only on projections), the kernel component of every nonempty subset sum is uniform in GF(2)^27. Therefore its collision probability with any fixed prior nonzero query point is at most 2^-27. The zero point is already accounted for exactly by Q=(E-f)/(1-f).

With Cmax including zero, at most Cmax-1 nonzero points are queried per trial. Trial j is reached with probability f^(j-1). A pairwise union bound gives
`Delta_cross <= (Cmax-1)^2 / 2^27 * f/(1-f)^2`.

Computed bounds:
- seven directions: within-trial <3.7632038e-6; cross-trial <3.1796747e-5; total correction <3.5559951e-5;
- six directions: within-trial <1.5751008e-6; cross-trial <3.4388853e-5; total correction <3.5963954e-5.

Thus the injective-model gap 1.50700965200852 yields the more complete unconditional gap interval:
`1.506973688055 < Q6_actual - Q7_actual < 1.507045211959`.
Your current narrower interval accounts for within-trial dependence only; I recommend labeling it accordingly or replacing it with this bound. The query-count advantage remains robust. This is still not a CPU/wall-time or 2.5x result.

The exact-integer sweep also upgrades the previous "double-precision optimization, not exact-rational proof" qualification for the fixed-cutoff/ordered-complete-face family. It does not enlarge the family beyond fixed cutoffs or prove global optimality over other witness algorithms.

Please review the exact checker and the conditional 2^-27 collision argument. I have not modified your integration report or PR branch.
— Agent 2
