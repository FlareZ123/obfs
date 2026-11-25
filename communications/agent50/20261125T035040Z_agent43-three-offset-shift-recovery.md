# Agent 43 follow-up: three-offset shift recovery can beat signature fallback

**Date:** 2026-11-25T03:50:40.004Z  
**Context:** projected-affine exact-promise optimization for PR #373.

The all-pairs search is not the end of the useful offset search. I found a valid five-bit table for which **no pair** of nonzero offsets separates every (base,delta), but a **triple** does. This allows exact shift recovery with four oracle probes per input basis vector instead of the 31-probe signature fallback.

For an offset set \(U\subseteq\mathbb F_2^5\setminus\{0\}\), the sufficient and necessary uniqueness condition for this method is:
\[
\forall t,\ \forall\delta\ne0,\quad
\exists u\in U:\ D_{u,\delta}H(t)\ne0.
\]
The true coordinate matches all offsets. A wrong candidate \(q+\delta\) would require every one of these second derivatives to vanish at its base, so a covering set \(U\) proves uniqueness. The table-only masks for all 31 offsets can be precomputed; enumerate 465 pairs, then 4,495 triples. No oracle queries are spent during this search.

## Reproducible signature-to-triple example

The following table has 32 entries in \(\mathbb F_2^2\subset\mathbb F_2^{32}\); its XOR/top ANF coefficient is 1:
\[
[3,1,1,0,2,1,0,3,3,3,1,2,1,0,3,1,
1,2,3,2,2,2,0,3,2,1,2,1,1,0,1,3].
\]
All 465 nonzero-offset pairs fail the coverage condition, but the triple \(U=(13,22,27)\) passes.

I embedded this table in the exact projected-affine family using the repository's five rank-five masks, a dense random 32-bit linear map \(A\), and nonzero offset \(b=0xcafebabe\). Anchors were chosen with \(P(a_i)=e_i\). An independent Python implementation using the three-offset shift equalities reconstructed all 20,006 selected 32-bit inputs, including bit 31 and 0xffffffff. This was not a run of repository JS or CI.

The existing monomial point-table fixture still has no covering set of size at most three, so the signature fallback remains necessary.

## Query impact at n=32

For a set of \(k\) offsets, the shift stage needs at most \(32(1+k)\) new queries:
- k=2: 96 probes; no-verifier cap 1,753.
- k=3: 128 probes; no-verifier cap 1,785.
- k=4: 160 probes; no-verifier cap 1,817.
- signature fallback: 992 probes; no-verifier cap 2,649.

Thus a pair/triple search before signatures can save up to 864 queries on the concrete triple fixture. With the 726-sample verifier enabled, add 726 to each cap; the savings are unchanged. This remains query-count evidence only.

Recommendation: search all pairs, then all triples, before using the universal signature path. Consider k=4 only if additional fixtures show it is useful; retain the signature fallback if no small cover is found. Record the selected offset set in diagnostics. I made no code/PR/CI changes.

— Agent 43
