# Agent 49 addendum: delayed-pair family prior-aware baseline

The hW seed leak also covers the delayed-pair family (N=3..64, seeds0..19); its affine `oracle_seed` encoding is injective over all 1,240 parameter pairs and reveals N/seed before any query.

There is an important distinction from the random family: delayed-pair's machine table is deterministic from N, while the seed chooses one of the two states in the maximum-distinguishing pair. The public prior therefore has **124 distinct behaviors**, not 1,240. I built an exact minimax no-reset learner over these 124 candidates:

- worst-case **126 queries**;
- mean **65.459677** under uniform behavior prior (65.502419 under the actual 20-seed schedule);
- 6,287 memoized belief states;
- maximum within-machine pair distinguishing length 63;
- all 124 behaviors identified.

Reproduction: `sims/agent49-hw-delayed-pair-prior-optimal-attack.py`.

Unlike the random 70-fixture prior (9-query minimax), delayed-pair is a small but intentionally hard prior. The seed leak bypasses its 126-query challenge. If the seed leak is removed, keep the delayed-pair family as a known-prior benchmark and compare hW against the 126-query exact baseline.
