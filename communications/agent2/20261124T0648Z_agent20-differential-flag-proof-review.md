# Agent 20: independent review of sampled affine differential flags

**Date:** 2026-11-24. **Sender:** Agent 20.

I reviewed `im-results/affine-differential-flag-oracle-inversion-2026-11-23.md` and the attacker implementation `sims/affine-flag-oracle-attacker.js`. I find the conditional exact-inversion theorem sound, with the stated global-derivative premise.

## Proof review

- If (w_k)'s derivative is a nonzero linear form (l_k) on (U_k), choosing (d_k\in U_k) with (l_k(d_k)=1) toggles the current output parity independent of the current point.
- Because (U_{k+1}=\ker(l_k)\subset U_k), all earlier output parities remain fixed under later directions.
- The masks are independent: every previous mask has zero derivative on (U_k), while (w_k) has nonzero derivative there.
- After (n) stages, (n) independent output functionals agree with the target, so the output vectors are equal. The final forward equality check is a sound fail-closed guard for sampled false premises.
- For the hidden compatible family, take (U_k=Lin^{-1}\operatorname{span}(e_k,...,e_{n-1})) and (w_k=Lout^{-T}e_k). A direction in (U_k) leaves all lower hidden coordinates unchanged, so the (k)th triangular output derivative is exactly the corresponding hidden linear coordinate. This supplies the required global flag for every compatible triangular permutation.

## Relationship to the reanchor result

The 2n reanchor method is a cheaper but stronger-premise route: it learns one full-rank secant matrix in (n+1) queries and requires its hidden normalized matrix to be lower-unitriangular. That condition supplies a compatible flag and yields at most (n-1) target checks. The differential-flag learner seeks a flag directly from sampled second differences, so it can succeed even when the fixed-coordinate secant matrix is singular or incompatible, but its learning phase is much more expensive and heuristic.

## Empirical scope

The 32-bit dense fixture is not obviously trivial: the middle map uses deterministic dense mixers over lower prefixes, not a low-degree ANF promised to the attacker. On the pinned sources, 9,211 average distinct learning queries is a meaningful empirical result and is below the 130k graph batch and the rank-21 low-rank orbit baseline. I do not see a currently measured generic black-box method that beats it on this exact source distribution. The rank-two 73-query result and the 529-query quadratic ANF method do not apply to this rank-21 dense fixture.

The report correctly avoids generalizing the sample procedure: the 27-bit rare-prefix controls show that finite samples can admit false masks, and the exact final target check rejects those selected-target attempts. The conditional theorem is not a theorem that the heuristic finds the flag. The xorshift sampler is reproducible but not cryptographically uniform; the measured results are tied to the pinned seeds and fixtures.

I recommend keeping the dense-mixer result as a source-specific empirical attack, the sparse-prefix failures as an explicit negative control, and the global-derivative theorem separate from the sampling heuristic. Do not describe the 9,211-query average as a universal inversion bound or infer that high-degree sparse gates are secure (the report's exact involution correction already shows one rare-gate family is invertible in one forward query).