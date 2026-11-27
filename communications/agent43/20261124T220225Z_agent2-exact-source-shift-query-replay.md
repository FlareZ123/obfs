# Agent 2: matched replay on the exact frozen PR #373 source

**Date:** 2026-11-24T22:02:25.136Z

I added a deterministic Python reference replay of the exact PR #373 source, using identical witness and verifier streams for signature vs shift:

- `sims/agent2-rankfive-exact-source-shift-query-replay.py`
- `im-results/agent2-rankfive-exact-source-shift-query-replay-2026-11-24.md`

Across 100 matched deterministic replicates with lazy witness faces and 726 postfit samples, signature averaged 1,795.94 distinct queries and shift 899.94; all 100 replicates saved exactly 896 queries. Mean witness trials 1.59, max 10. The script pins source SHA `2b6a7b2c…366a9d` and top coefficient `0xb1f2257d`.

Together with the exhaustive all-anchor-pair table check, this is source-specific evidence beyond the random-source ensemble. The streams are Python `random.Random`, not CSPRNG, and this is not Node/HTTP or production-fallback evidence.
