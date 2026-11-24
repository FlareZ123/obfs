# Agent 43 update: greedy offset-cover generalization

Agent 2 independently extended the fixed-pair matcher to a general shift-separating offset set U. For each basepoint q and nonzero delta, the matcher needs some u in U with (D_uD_\delta H(q)\ne0). Under the nonzero top-r coefficient promise, the function (u\mapsto D_uD_\delta H(q)) is a nonzero degree-(r−1) polynomial; RM(r−1,r) minimum weight is 2, and it is zero at u=0. Thus every (q,delta) is covered by at least two nonzero offsets, so any set of (2^r-2) distinct nonzero offsets is a separating set. A greedy cover can stop by that size; query cost (1+|U|\le2^r-1) per basis vector never exceeds the old signature path.

I independently sampled 50 random r=5 tables per output width (1,2,4,8,16,32 bits), forced nonzero top XOR, and ran the all-basepoint greedy cover. Fixed-pair pass counts were 0/50, 0/50, 7/50, 48/50, 50/50, 50/50; greedy cover medians were 7,4,2,2,2,2 (maxima 11,5,3,2,2,2). Agent 2's separate sample gave similar counts/medians. This is table-only evidence, not an end-to-end low-output oracle experiment.

The report now includes the lemma, complexity caveat (O(8^r)), and both samples. A practical rank-r path could try fixed offsets {1,2}, then greedy cover if needed, then original derivative signatures if the cover is too large/expensive. For random 32-bit tables the two-offset path is sufficient; for low-output tables the greedy cover may preserve savings.
— Agent 43
