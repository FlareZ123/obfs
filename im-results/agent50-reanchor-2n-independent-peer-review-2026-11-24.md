# Independent peer review: conditional 2n reanchoring bound

**Reviewer:** Agent 50. **Date:** 2026-11-24. **Classification:** independent proof review plus finite computational corroboration; intermediate result, not novelty-reviewed.

## Verdict

I found no proof gap in Agent 20's 2n bound **under the stated hidden-B premise**. The extra initially correct bit follows: the normalized compatible map has h0 constant and h1 of the form c XOR a*z0; the observed finite differences vanish along the basis Lin(e_i), and at least one basis vector has hidden bit zero set, forcing a=0. The initial candidate therefore has its lowest two bits correct.

The premise must remain explicit. P being compatible triangular and M_r being invertible do **not** imply that B=Lout^-1 M_r Lin^-1 is lower-unitriangular for arbitrary invertible Lin. I constructed a four-bit counterexample to that broader implication, and the 2n iteration misses its target within n-1 candidate checks. This is not a counterexample to the conditional theorem; it demonstrates why the hidden-B condition cannot be silently dropped.

## Proof review

Write

\[
F(x)=a\oplus L_{\rm out}P(L_{\rm in}x\oplus b),
\qquad z_r=L_{\rm in}r\oplus b.
\]

Let M_r have columns F(r XOR e_i) XOR F(r), and suppose

\[
B=L_{\rm out}^{-1}M_rL_{\rm in}^{-1}
\]

is lower-unitriangular. Set Q=B^-1 P and write Q(z)=z XOR h(z). Since B^-1 and P are both compatible lower-triangular permutations, Q is compatible too: h_j depends only on z_0,...,z_(j-1).

By the definition of M_r,

\[
P(z_r\oplus L_{\rm in}e_i)\oplus P(z_r)
  =B L_{\rm in}e_i.
\]

Applying B^-1 gives

\[
Q(z_r\oplus L_{\rm in}e_i)\oplus Q(z_r)
  =L_{\rm in}e_i,
\]

so every corresponding finite difference of h vanishes at z_r.

Now h0 is constant by compatibility. Also h1 can depend only on z0, so over GF(2) it has the form c XOR a*z0. Since the columns of invertible Lin span the hidden space, some Lin(e_i) has bit zero equal to one. The zero finite-difference condition in that direction forces a=0. Thus h1 is constant as well.

For target y=F(x*), the initial candidate in hidden coordinates is

\[
z^{(0)}=z^*\oplus h(z^*)\oplus h(z_r).
\]

Its coordinates zero and one are correct because h0 and h1 are constant. Each fixed-point correction

\[
x' = x\oplus M_r^{-1}(F(x)\oplus y)
\]

is the public-coordinate form of the triangular update; it preserves already-correct lower coordinates and fixes the next one. Starting with two correct bits takes at most n-2 corrections. Checking the initial candidate and each corrected candidate takes at most n-1 candidate checks. The interpolation uses n+1 queries, so the total is

\[
(n+1)+(n-1)=2n.
\]

At n=2 there are no corrections and one candidate check, for four queries. This is consistent with the proof. The number of distinct queries is at most the number of calls; Agent 20's chained 32-bit witness establishes that all 64 can be distinct.

## Positive wrapped/nonzero-anchor reproduction

I added sims/agent50-reanchor-2n-peer-check.py. It independently implements GF(2) matrices and a reanchoring inverter, then tests 700 deterministic wrapped cases: 100 each at widths n=2,...,8. Each case uses a compatible triangular permutation, nonzero input/output offsets, a nonzero anchor, an arbitrary invertible output map, and a flag-preserving invertible input map for n>=3. At n=2, arbitrary invertible input maps are used because every compatible two-bit permutation is affine.

For every positive case, the observed matrix was invertible, the normalized B was lower-unitriangular, and the secret was recovered. The maximum observed calls by width were:

| n | Cases | Maximum calls | Maximum distinct queries | Maximum candidate checks |
|---:|---:|---:|---:|---:|
| 2 | 100 | 4 | 4 | 1 |
| 3 | 100 | 6 | 6 | 2 |
| 4 | 100 | 8 | 8 | 3 |
| 5 | 100 | 10 | 10 | 4 |
| 6 | 100 | 12 | 12 | 5 |
| 7 | 100 | 13 | 13 | 5 |
| 8 | 100 | 15 | 15 | 6 |

This is corroboration of the stated premise, not a substitute for the algebraic proof or a universal black-box result.

## Why arbitrary Lin cannot be silently included

Take n=4 and the compatible triangular permutation

\[
\begin{aligned}
P_0(z)&=z_0,\\
P_1(z)&=z_1,\\
P_2(z)&=z_2\oplus z_0\oplus z_0z_1,\\
P_3(z)&=z_3\oplus 1\oplus z_2\oplus z_0z_1z_2.
\end{aligned}
\]

Use Lout=I, input offset b=11, anchor r=9, and an invertible but non-flag-preserving Lin with columns [2,13,4,3]. The observed matrix has columns [2,13,12,7] and rank four, but

\[
B=M_rL_{\rm in}^{-1}
\]

has columns [5,2,12,4] and rows [1,2,13,4]. It is not lower-unitriangular (row 2 contains a nonzero entry in column 3, and the final diagonal entry is zero).

For secret x*=0, the target is 3. The first three candidate checks are:

| Check | Candidate | F(candidate) | Matches target? |
|---:|---:|---:|---|
| 1 | 15 | 11 | no |
| 2 | 4 | 7 | no |
| 3 | 11 | 15 | no |

Thus the 2n bound cannot be extended to arbitrary hidden input wrappers solely from compatibility of P and invertibility of M_r. This is outside the theorem's premise, not a counterexample to it.

## Scope and recommendation

- Accept the 2n derivation as correct under the explicit lower-unitriangular hidden-B premise.
- State clearly that the premise is source/anchor/wrapper dependent and is not certified by the chosen-input transcript alone.
- Do not imply that arbitrary invertible Lin preserves the premise. The four-bit example shows it does not.
- Keep the exact 32-bit 64-query witness as the tightness demonstration; the new 700-case corpus is only a supplementary wrapped/nonzero-anchor check.
- Keep the finding in im-results. It is an attack-side conditional theorem and does not establish source recovery, universal inversion, authorized-environment locking, or the defender's 2.5x runtime budget.

**Reproduction:** python3 sims/agent50-reanchor-2n-peer-check.py
