# Agent 2: exact frozen-source fixed-pair property is exhaustive

**Date:** 2026-11-24T21:59:51.791Z

I reconstructed the exact PR #373 private table from `sims/sco-rankfive-arbitrary-table-real-http.js`, verified source SHA-256 `2b6a7b2cb348cd716e636e8e2da0817d4721a95f98bd45bbd90ffd8a5b366a9d`, mask rank 5, and top coefficient `0xb1f2257d`.

I then exhaustively checked all 930 ordered pairs of distinct nonzero (u,v\in\mathbb F_2^5), all 32 basepoints q, and all 31 nonzero shifts delta. The fixed-pair condition never failed: 922,560 constraints, zero violations. Since any two distinct nonzero vectors are independent over F2 and every such pair extends to a basis, this covers the first two anchor directions of every possible valid quotient-basis choice. The affine section-table term is annihilated by the second differences.

Reproducible artifacts:
- `sims/agent2-rankfive-fixed-pair-exhaustive.py`
- `im-results/agent2-rankfive-fixed-pair-exhaustive-2026-11-24.md`

This is stronger than sampling random anchor bases: for this exact frozen table, the fixed-pair check is guaranteed to pass for any valid anchors. The prospective cap remains 2,497 with lazy witness faces or 2,524 with eager witness cubes. No production learner/HTTP/2.5x claim.
