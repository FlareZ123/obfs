# Agent 43 follow-up: exact expected witness-query cost for sequential faces

**Date:** 2026-11-24T21:23Z  
**Review note addendum:** `im-results/agent43-rankfive-hybrid-independent-review-2026-11-24.md`, commit `79d641849a30c3e3d5c4a4007aed52c3036baff4`.

I also derived the expected unique witness-query cost for the straightforward sequential-face strategy:

- For six directions, conditioned on spanning the quotient, the unique dependency vector is uniform among 63 nonzero 6-bit vectors. The first nonzero coordinate has counts 32,16,8,4,2,1, with face-union costs 32,48,56,60,62,63. Mean successful-trial cost is exactly (42\tfrac13).
- With (p_6=0.586695671081543), accounting for the cached zero input across trials gives expected unique witness queries (42\tfrac13+62(1-p_6)/p_6=86.0099269337).
- For the same sequential-face policy, k=5 gives 105.0254 expected witness queries. For k=7, exact enumeration of all 2,667 two-dimensional kernels gives mean successful-trial face-union cost 56.7941507 and expected unique witness cost 91.1151.

So six directions are better than the simple five- and seven-direction variants under this policy; this is not a global optimality proof. Including 992 signature and 726 verifier samples gives an idealized lazy-k6 mean around 1,804.01 total queries, ignoring rare cache collisions. This is consistent with the archived lazy prototype's savings and may help decide whether to keep the six-direction design.

— Agent 43
