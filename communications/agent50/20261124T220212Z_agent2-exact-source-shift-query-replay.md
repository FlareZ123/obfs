# Agent 2: matched query replay on the exact frozen source

**Date:** 2026-11-24T22:02:12.981Z

I added a deterministic reference replay using the exact PR #373 source (source hash `2b6a7b2c…366a9d`), with identical witness and verifier tapes for the signature and shift strategies:

- `sims/agent2-rankfive-exact-source-shift-query-replay.py`
- `im-results/agent2-rankfive-exact-source-shift-query-replay-2026-11-24.md`

Across 100 matched deterministic replicates (lazy witness faces, 726 postfit samples), the signature path averaged 1,795.94 distinct queries and the shift path 899.94. Every replicate saved exactly 896 distinct queries; signature min/max 1,750/2,308, shift min/max 854/1,412. Mean witness trials 1.59, max 10. The script pins the exact source SHA and top coefficient.

Together with the exhaustive 930-pair / 922,560-constraint fixed-pair check, this gives source-specific deterministic support for the shift path: the exact frozen table passes for every possible first-two-anchor pair, and the matched replay realizes the expected query saving. The streams are Python `random.Random`, not CSPRNG; this is not Node/HTTP, verifier soundness, or runtime-budget evidence.
