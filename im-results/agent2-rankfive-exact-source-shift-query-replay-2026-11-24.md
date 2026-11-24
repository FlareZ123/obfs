# Matched query-count replay: section-table shift matcher on the exact frozen rank-five source

**Date:** 2026-11-24  
**Status:** reproducible deterministic Python reference replay; not live HTTP or production Node evidence.

## Setup

The script `sims/agent2-rankfive-exact-source-shift-query-replay.py` reconstructs the exact private source used by PR #373, asserts the frozen source SHA-256
`2b6a7b2cb348cd716e636e8e2da0817d4721a95f98bd45bbd90ffd8a5b366a9d`
and top table coefficient `0xb1f2257d`, then compares:

- the original five-contraction derivative-signature coordinate recovery; and
- the two-offset section-table shift matcher.

Both strategies receive the same deterministic witness and verifier streams in each replicate. Both use the same lazy sequential witness-face search, the same source, the same section table, and 726 postfit verification samples. The source oracle is evaluated exactly and distinct input points are cached.

Run:

```sh
python3 sims/agent2-rankfive-exact-source-shift-query-replay.py
```

## Result

**Result:** 100/100 matched replicates saved exactly 896 distinct queries.

| Metric | Derivative signatures | Shift matcher |
|---|---:|---:|
| Mean distinct queries | 1,795.94 | 899.94 |
| Minimum distinct queries | 1,750 | 854 |
| Maximum distinct queries | 2,308 | 1,412 |

- Mean saving: **896 distinct oracle queries per replicate**.
- Minimum and maximum saving: **896** in every replicate.
- Mean witness trials: 1.59; maximum: 10.
- Every one of the 726 postfit samples matched the reconstructed model in every run.
- The exhaustive fixed-pair table check is separately recorded in `agent2-rankfive-fixed-pair-exhaustive-2026-11-24.md`: it establishes that this exact table passes the shift condition for every possible first-two-anchor pair.

The 896-query saving is the 28-probe-per-input-coordinate difference between 31 signature points and 3 shift points, observed without cross-coordinate/cache overlap in these 100 deterministic tapes. It is not a theorem that every possible witness tape must save exactly 896 distinct points; cache overlaps can change actual savings in other runs.

## Interpretation and limits

This is a stronger source-specific query-count replay than using unrelated random tables: it uses the exact frozen PR #373 source and matched randomness. It supports the predicted reduction from the signature path to the shift path for this source.

The witness and verifier streams use Python's deterministic `random.Random`, not a CSPRNG. The replay does not test the false-accept probability, worker isolation, Node implementation, SCO HTTP path, browser behavior, arbitrary tables, out-of-promise fallback, runtime/CPU cost, or the 2.5× compute budget. It is an intermediate simulation and does not justify PR merge or results-index promotion.
