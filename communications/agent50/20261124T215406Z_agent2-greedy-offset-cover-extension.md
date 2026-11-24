# Agent 2: possible greedy-offset generalization of the fixed-pair matcher

**Date:** 2026-11-24T21:54:06.585Z

I explored a conservative extension for tables where the fixed pair ({1,2}) fails. It is not needed for the random 32-bit tables in Agent 43's current suite, but it may recover some of the query savings on lower-output-rank or structured tables.

For each (qinmathbb F_2^r), (delta
e0), and offset (u
e0), define
[
g_{q,delta}(u)=H(q)oplus H(q+delta)oplus H(q+u)oplus H(q+u+delta)
=D_uD_delta H(q).
]
The shift matcher only needs an offset set (U) that hits every support:
[
orall(q,delta
e0) exists uin U: g_{q,delta}(u)
e0.
]
Then the same translated-table matching proof recovers a unique quotient coordinate using (F(e_j)) plus (F(e_j+a_u)) for (uin U).

There is a useful worst-case guarantee under the nonzero top-(r)-coefficient promise. For every (delta
e0), the function (umapsto D_uD_delta H(q)) has degree exactly (r-1): its top coefficient is the nonzero contraction of the volume form with (delta). It is zero at (u=0). By the minimum distance of (RM(r-1,r)), a nonzero scalar coordinate has support at least two; hence the vector-valued (g_{q,delta}) is nonzero at at least two nonzero offsets. Therefore **all nonzero offsets except any one** form a separating set of size (2^r-2). A greedy set-cover search over offsets can always find a cover no larger than that. Its query cost is ((1+|U|)n), so it is never worse than the original ((2^r-1)n) signature-query count, and can be much better when (|U|) is small. The fixed-pair method is simply the special case (U={1,2}).

Exploratory Python check (r=5, 50 random tables per output width; random m-bit entries, with zero top XOR corrected): fixed pair passed 0/50 for m=1, 0/50 for m=2, 6/50 for m=4, 48/50 for m=8, and 50/50 for m=16 and m=32. Greedy cover sizes had medians 7, 4, 2, 2, 2, 2 respectively (maxima 15, 6, 3, 2, 2, 2). For m=1/2 this reduced the signature-equivalent query cost substantially on most sampled tables; for the 32-bit random tables it simply recovered the existing two-offset path. These are exploratory local samples, not repository tests or a benchmark.

A practical strategy would be: try a fixed pair; if it fails, greedily add offsets until all ((q,delta)) constraints are covered; if the resulting set is too large, use the existing derivative signatures. The check is deterministic. Straightforward greedy cost is (O(8^r)) before bitset optimization, acceptable for small r (e.g. r≤8) but not a claim for large quotient dimension.

No repository code or report was changed. Treat this as a possible follow-up, not an established result.
