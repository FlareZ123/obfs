# Independent execution blocks versus repeated in-process runtime samples (23 November 2026)

**Agent 17. Classification:** Intermediate evidence-admission methodology, not new obfuscator security mathematics or a positive candidate. Strong three-mode release remains **RELEASE-BLOCKED**.

## Problem: measured pairs are not automatically iid

The repository's `familywiseBudgetBounds` correctly states that a binomial upper rate bound on strict >2.5× paired-runtime violations needs **independent representative paired trials within each fixed workload**. This assumption is material: a suite may alternate several native/protected timings inside one Node process, sharing JIT state, scheduler phase, GC pressure, CPU frequency and an uncontrollable environment. Recording thirteen array elements is not evidence of thirteen independent replications.

For a mathematically sharp counterexample, suppose a fresh process draws an unobservable Bernoulli variable `Z` with probability `p`, then reports **thirteen perfectly correlated pairs**, all strict breaches when `Z=1`, all within budget otherwise. One process yields thirteen visually breach-free ratios with probability `1-p`, **not** `(1-p)^13`. At true `p=0.5`, this event occurs with probability **50%** despite a naive thirteen-pair, K=12, 95%-joint upper estimate of approximately **34.4%**. In other words, merely repeating the measurement in the same process can produce a falsely tight confidence bound, even though every recorded pair is numerically correct. This is a failure of the iid assumption, not of the exact binomial inversion.

## Conservative block-level alternative

Added `sims/cluster-strict-tail.js` and `test/cluster-strict-tail.test.js`. Each paired measurement supplies a prospective `blockId`; pairs with the same ID are considered **one block**, even if a block contains many timings. A block is a strict violation if **any** protected/native paired ratio is >2.5. For K fixed workload populations, n independently replicated, identically exposed blocks per population, zero observed block breaches and confidence 1-alpha, the one-sided exact/Bonferroni upper bound on a *future block* having **any breach** is

```
upper P[at least one strict violation in a future block]
  = 1 - (alpha/K)^(1/n).
```

**Dependence within a block is arbitrary.** No per-pair independence is needed. The function counts all observed breaching pairs, all breached blocks, and the maximum ratio; one observed strict breach returns `null` instead of a zero-breach upper endpoint. Different workloads need not be independent. Blocks within each workload must nevertheless be iid and **identically exposed**; the implementation enforces equal number of pairs per declared block as a necessary, not sufficient, check. An arbitrary `blockId` is a user declaration, **not proof** that different processes, workloads or time windows are independent and representative. Cross-process shared scheduler effects may also violate the assumption.

| K=12 fixed workloads, 95% familywise confidence, zero strict breaches | Declared independent blocks per workload | P[future block breaches] upper |
| --- | ---: | ---: |
| Thirteen pairs in one process/replication | 1 | 99.5833% |
| Thirteen separately independent equally exposed replications | 13 | approximately 34.4% |
| 546 separately independent replications | 546 | at most 1% |

The `546` figure assumes every block is breach-free and is **not** reduced by packing more correlated samples inside each block. This follows the same prospective exact inversion in [the earlier zero-breach planner](strict-tail-sample-power-2026-11-23.md), but uses a **different estimand**: probability a future *whole block* has at least one breach, not the probability a randomly chosen single pair breaches.

## Reproducibility and limits

- Local Node 22.16.0: **4/4 focused tests passed**. Test cases cover thirteen correlated pairs versus thirteen independent blocks; the strict threshold (equality is not a breach); two breached blocks with one true violation each; invariance of bound under 1 versus 17 pairs per block; all invalid time, confidence, threshold, block-ID and unequal block-size cases.
- The code and tests are enrolled in `jsconfig.external.json` and `jsconfig.paired-budget.json`. Focused two-platform CI is pending source-pin review when this report was written; do not infer a cross-platform pass from the local 4/4.
- No existing release evidence is relabelled as independently sampled. Historical run order/process identity must be checked before attributing iid status, and potentially remeasured using independently replicated process boundaries. Absence of a breach in a finite set is never proof of a universal maximum ratio.
- Does **not** weaken the 2.5× hard rule: **every strict observed >2.5× pair remains a veto**, even if its estimated future block violation frequency is unreported. Nor does this cluster method establish any static/dynamic confidentiality, tamper resistance or environment locking under the SCO/COO/SNO attacker powers.
- The implementation is a cautious reapplication of elementary exact Bernoulli/Bonferroni mathematics to process-level risk; no novelty or academic result is asserted.

The immediate engineering use is to require authentic replication metadata in future budget sweeps, rather than deriving high joint-confidence statements merely from repeated in-process timing arrays.
