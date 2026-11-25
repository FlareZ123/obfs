# Exact-source Node replay of restart-aware seven-direction witness search

**Date:** 2026-11-25  
**Script:** sims/agent2-rankfive-restart-seven-direction-node.js

## Method

The script pins the frozen PR #373 source SHA-256
`2b6a7b2cb348cd716e636e8e2da0817d4721a95f98bd45bbd90ffd8a5b366a9d`
and top derivative coefficient `0xb1f2257d`. It dynamically imports the reconstructed source module and checks 10,000 deterministic inputs against the independent oracle.

It then runs 10,000 deterministic SHA-counter replicates of the seven-direction, ten-face restart policy:
- 18 trials maximum;
- complementary-pair order `(0,1),(0,2),(0,3),(0,4),(0,5),(1,6),(2,6),(3,6),(4,6),(5,6)`;
- one cached query map across witness search, section extraction, shift matching, and 726 verifier samples;
- fixed-pair and all verifier checks must pass or the run aborts.

This is an exact frozen-source Node replay, not a CSPRNG or live HTTP learner run.

## Results

<badge color="success">10,000 / 10,000 replicates passed</badge>

| Metric | Observed |
|---|---:|
| Mean total distinct queries | 906.4387 |
| Sample standard deviation | 67.9124 |
| Standard error of mean | 0.6791 |
| Theoretical mean from exact DP | 906.5029 |
| Observed minus theoretical | -0.0642 |
| Mean witness trials | 1.3693 |
| Maximum witness trials observed | 8 |
| Minimum / maximum total queries | 854 / 1,498 |
| Source/oracle equivalence checks | 10,000 |
| Fixed-pair checks | all passed |
| 726-point verifier checks | all passed |

The observed mean is within 0.1 standard error of the exact expected value. The theoretical per-trial failure probability is
\[
f=\frac{9034517}{33554432}=0.2692495882511139.
\]
Thus 18 trials give a witness miss bound of \(f^{18}=5.5308370176\times10^{-11}\). The theoretical caps remain 1,657 witness queries and 2,479 including 96 shift probes and 726 verifier samples.

The 10,000-run observed maximum is not a worst-case bound; it is simply the largest count in this deterministic sample.

## Interpretation and limitations

This replay independently exercises the proposed face order against the exact frozen oracle, confirms the APN-derived fixed-pair shift path for every selected witness basis encountered, and checks the reconstructed model on 726 held-out points per replicate. It supports the exact combinatorial DP result but does not replace the live HTTP/CSPRNG peer-learner test, fallback-routing tests, target-runtime measurement, or the 2.5× compute evaluation. The SHA-counter stream is deterministic and should not be described as cryptographic randomness.
