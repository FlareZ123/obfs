# Node replay: shift matcher on the exact frozen rank-five source

**Date:** 2026-11-24  
**Status:** deterministic standalone Node reference replay; not production peer/HTTP or CSPRNG evidence.

## Reproduction

Run:

```sh
node sims/agent2-rankfive-exact-source-shift-node.js
```

The script is pinned to the exact private source used by PR #373:

- source SHA-256: `2b6a7b2cb348cd716e636e8e2da0817d4721a95f98bd45bbd90ffd8a5b366a9d`;
- top table coefficient: `0xb1f2257d`;
- Node runtime used: `v22.16.0`;
- repository script blob: `3927615236391a857465bbe0bd2364075b8433f3`.

It dynamically imports the reconstructed source module and checks 10,000 deterministic inputs against the independent oracle formula. It then compares the five-contraction derivative-signature method with the two-offset section-table shift method over 100 matched deterministic SHA-counter streams. Both strategies use the same exact oracle, witness stream, verifier stream, lazy sequential witness-face search, and 726 postfit samples per replicate. The script checks the source hash, fixed-pair table property, unique coordinate candidates, and every verification equality.

## Output

| Metric | Signature | Shift |
|---|---:|---:|
| Mean distinct queries | 1,804.28 | 908.28 |
| Minimum distinct queries | 1,750 | 854 |
| Maximum distinct queries | 2,026 | 1,130 |

- Mean savings: **896 distinct oracle queries**.
- Minimum and maximum savings: **896** in every replicate.
- Mean witness trials: 1.70; maximum: 5.
- 72,600 postfit verification points were checked across the 100 shift runs (726 per run); all matched.
- The fixed-pair table condition passed in all 100 section tables.
- Differential uniformity 2 was asserted in Node; 10,000 source-module equivalence checks passed before the query replay.

The 896 savings are exactly 28 fewer coordinate probes for each of 32 input basis vectors in these tapes. This is consistent with 31 signature points versus 3 shift points per basis vector; no extra cache overlap changed the difference in these runs.

## Interpretation and limits

This is a standalone Node 22 implementation of the mathematics against the exact frozen source, stronger than a Python-only replay and more source-specific than the random-table ensemble. It supports the expected query reduction for the promised projected-affine source.

It is **not** the PR #373 peer learner, not a worker-isolation test, not the SCO HTTP harness, and not a CSPRNG experiment. Relative to the full degree-≤5 ANF interpolation basis of 242,825 points, the mean 908.28-query shift replay is about 267.3× fewer distinct queries; the 2,497 lazy fast-path cap is about 97.2× below that basis size. This is a specialized-versus-general comparison, not a like-for-like baseline under identical source promises. All sources are in-promise; the script does not exercise no-witness, shift-ambiguity, signature-overflow, verifier-mismatch, or exact-ANF fallback paths. It does not measure target runtime/CPU, browser/COO/SNO behavior, or the 2.5× budget. Keep this in `im-results/`; no merge or release conclusion follows.
