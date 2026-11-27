# Agent 43 follow-up: search all fixed offset pairs before signature fallback

**Date:** 2026-11-25T03:48:40.175Z  
**Context:** verifier-free projected-affine review of PR #373.

I found a query-saving extension to the fixed-pair test. The learner currently tests only quotient offsets {1,2} (the first two anchor coordinates). If that pair fails, it immediately pays for the 5-signature path. But a different pair of distinct nonzero quotient offsets can still satisfy the exact uniqueness condition.

For any pair \(u,v\in\mathbb F_2^5\setminus\{0\}\), \(u\ne v\), the shift recovery remains exact if, for every base \(t\) and every \(\delta\ne0\), at least one of
\[
D_{u,\delta}H(t),\quad D_{v,\delta}H(t)
\]
is nonzero. This is the same condition already checked for {1,2}. A wrong candidate \(q+\delta\) would require both to vanish at its base; the true candidate always matches. There are only \(\binom{31}{2}=465\) pairs, and each check scans 32×31 table positions: 461,280 cheap table comparisons, with no additional oracle queries. If any pair passes, query \(F(e_j)\), \(F(e_j+S(u))\), \(F(e_j+S(v))\) for each input basis vector and use the same candidate-correction equality. If no pair passes, retain the signature fallback.

## Concrete counterexample to the current fixed-pair-only policy

I generated a valid 8-bit-output table \(h:\mathbb F_2^5\to\mathbb F_2^{32}\) with nonzero top coefficient 0xd6. For this table:
- pair {1,2} fails the current exhaustive fixed-pair condition;
- pair {1,4} passes it.

The table, in hexadecimal, is:
\[
[27,60,44,cf,6b,e6,70,1a,05,38,64,15,46,72,fd,16,
bc,dc,d1,79,b1,96,95,b2,a2,42,0b,0f,ef,df,85,f7].
\]
Its XOR is 0xd6, so the fifth-degree coefficient is nonzero.

I embedded it in the exact projected-affine family using the repository's five rank-five masks, a dense random 32-bit linear map \(A\), and nonzero offset \(b=0xd4c3b2a1\). I chose anchors whose P-images are the five standard basis vectors. An independent Python implementation selected pair {1,4}; the shift reconstruction matched all 20,006 selected 32-bit inputs, including bit 31 and 0xffffffff. This was not a run of repository JS or CI.

For comparison, the existing monomial point-table fixture still has no passing pair among all 465 pairs, so the signature fallback remains necessary and is not made redundant.

## Potential impact

For n=32, the no-verifier worst-case cap becomes:
- current fixed-pair then signature policy: 1,657 witness + 992 signature = 2,649;
- all-pairs search then shift when possible: 1,657 witness + 96 shift = 1,753.

That is up to 896 fewer oracle queries for tables where another pair works. The same 896-query reduction applies to the verifier-enabled caps. This does not change the exact-promise requirement or establish CPU/2.5x performance.

Recommendation: before signature fallback, scan all 465 offset pairs and record the selected pair in diagnostics. Preserve the signature fallback if none works. I made no code/PR/CI changes.

— Agent 43
