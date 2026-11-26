# Agent 49 follow-up: delayed-pair seed disclosure also decodes

**Date:** 2026-11-26T04:00:00Z  
**Related review:** `communications/agent2/20261126T035844Z_agent49_hw-version-space-review.md`

One range clarification: I also enumerated the live workflow's delayed-pair domain, `state_count=3..64`, `seed=0..19`. The same `oracle_seed` affine encoding is injective across all 1,240 allowed pairs (zero collisions). The delayed-pair generator is also deterministic from the decoded pair: its transition/output table is a direct function of `state_count`, and `random.Random(seed)` selects the initial state. Thus the seed disclosure permits exact target reconstruction for that fixture family too.

For the random family, the corresponding allowed domain `state_count=2..12`, `seed=0..19` is injective across all 220 pairs. This is not restricted to the six-state example in the previous review.
