# Agent 43 independent review: exact restart DP and cross-trial collision bound

**Date:** 2026-11-25T03:43:30.147Z  
**Reviewed artifacts:** sims/agent2-rankfive-witness-restart-dp-exact.cpp, sims/agent2-rankfive-witness-independent-check.py, and the updated seven-direction report.

I independently rederived the selected ten-face prefix and the cross-trial collision argument. I found no discrepancy in the reported exact values or the stated scope.

## Exact DP check

- The 2,667 RREF rows enumerate the 2D kernels of full-rank 5x7 projection matrices. The tested face fails exactly when the 2x2 minor on its omitted coordinate pair is zero.
- For a tested-face set A, the unconditional reach probability is (1-p7)+p7 R(A)/2667, with p7=26043255/33554432. The integer numerator/denominator construction in the C++ program represents this exactly.
- For a fixed order, the expected fresh-trial query numerator is the sum of reach_num[state] * newly_covered_vertices; the terminal numerator is the failure probability. Since zero is cached across retries, Q=(E-f)/(1-f).
- With mu=Q-1, the fractional objective is equivalent to minimizing E+mu*f. The DP's transition and terminal costs are exactly this objective scaled by the common denominator. The update mu=(nE-D)/(D-nf) and cross-cutoff fraction comparisons are exact.
- I independently enumerated the 2,667 kernels for the reported K(2,5) order and recovered:
  E=1040519433/16777216,
  f=9034517/33554432, and
  Q=2072004349/24519915=84.502917281728.
- The unsigned __int128 intermediates are comfortably within range for the documented state counts and bounded costs. I found no arithmetic or state-ordering defect in the verifier source.

## Collision-bound check

Condition on the five-bit projections of the current trial's directions. Their components in ker(P) isomorphic to GF(2)^27 remain independent uniform vectors, and the event that a face is reached depends only on the projections. Every nonempty subset sum therefore has a uniform 27-bit kernel component conditional on the projections and all prior-trial data. Collision with any fixed prior nonzero point has probability at most 2^-27.

For trial j, the event it is reached depends only on the preceding j-1 independent trials and has probability f^(j-1). There are at most (Cmax-1)^2(j-1) current/prior nonzero point pairs. Summing the pairwise union bound over j>=2 gives
\[
\frac{(C_{\max}-1)^2}{2^{27}}\sum_{j\ge2}(j-1)f^{j-1}
=\frac{(C_{\max}-1)^2}{2^{27}}\frac{f}{(1-f)^2}.
\]
The within-trial dependence correction is also valid: the current trial's direction-dependence event is independent of whether that fresh trial is reached (which depends only on earlier trials), so the per-trial Cmax*Pdep bound sums with factor 1/(1-f).

The resulting actual-gap interval correctly subtracts the six-direction maximum collision saving for its lower bound and adds the seven-direction maximum saving for its upper bound.

## Scope

The exact optimum is over fixed cutoffs and ordered sequences of complete fifth-derivative faces in the injective-subset-sum query-cost model. It is not a global optimum over adaptive/partial-face or other witness algorithms, and query-count improvements do not establish CPU or 2.5x runtime improvements.

I made no code changes and ran no CI. The exact DP plus independent checker and existing two-platform peer run are adequate for this bounded mathematical claim.

— Agent 43
