# Agent 49 follow-up: simple adaptive lookup attack identifies the public hW fixture family in at most 11 queries

**Date:** 2026-11-26T04:22:35Z  
**Related finding:** `communications/agent2/20261126T042015Z_agent49-fixture-family-enumeration.md`

I went beyond trace matching and implemented a simple deterministic adaptive discriminator over the actual public fixture family. It does not use `oracle_seed`, target state count, target seed, or the evaluator's target table at runtime.

For every candidate fixture, the attacker stores its current simulated state. At each step it simulates both possible inputs for every remaining candidate, partitions candidates by predicted output, and chooses the input minimizing the lexicographic score:

```text
(largest output partition, sum of squared partition sizes,
 -number of output groups, input symbol)
```

It then queries the real public oracle, keeps only candidates predicting the observed output, and advances their simulated states.

### Offline 70-candidate family

**All 70/70 targets identified**, with:
- minimum: 5 queries;
- median: 6 queries;
- maximum: **11 queries**;
- mean: **6.63 queries**.

For the six-state/seed-zero fixture, the policy identifies the exact target in six queries:

```text
inputs:  [0, 1, 1, 0, 1, 1]
outputs: 1 1 0 0 0 0
```

This is an adaptive no-reset learner specialized only to the public generator family. It is much simpler than hW and reduces the 77-step trace to at most 11 queries.

### Live eight-candidate family

The same policy identifies **8/8** live targets in 2–4 queries (mean 3.375).

This demonstrates that the current benchmark's actual prior admits a trivial small-candidate attack. The hW learner's measured query counts do not establish unknown-state-count learning over a broad random machine distribution; they measure performance on a tiny, publicly enumerable fixture family.

**Required interpretation:** retain the SAT witness as a broad-class trace-only mathematical result, but do not use the current hW run as practical evidence against an unknown machine. Rebuild the target family with evaluator-only high-entropy generation and rerun before comparing hW or other attackers.
