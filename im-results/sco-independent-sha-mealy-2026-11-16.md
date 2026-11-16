# Independent SHA-256 Mealy oracle challenge (16 November 2026)

**Status:** intermediate local experiment. Source and regression added to main on 16 November; cross-platform GitHub Actions verification was dispatched after the additions and must be confirmed before upgrading its status. This is an independent fixture distribution for the existing public chosen-input SCO attack, not a new production obfuscator or a proof of confidentiality.

## Motivation and scope

Prior SCO step-only attack evaluations sampled Mealy transition/output tables from one related linear-congruential generator. A technique that works on those tables may overfit the generator. This experiment keeps the actual published attacker unchanged and varies the evaluator's private-model distribution. It derives each binary transition and output independently by domain-separated SHA-256 hashes of public seed, hidden-state count, state identifier, symbol, and field tag. Uniform bounded draws use rejection sampling over unsigned 32-bit digest prefixes. This is a deterministic reproducible fixture family, not certified statistically independent randomness or a server security mechanism.

The attacker receives only an asynchronous step(symbol) callback. It sees output bits for the input symbols it actually submits. The post-attack evaluator separately inspects the private tables to distinguish physical global convergence, full-model behavioral equivalence, and post-discovery reachable-state behavioral equivalence. Behavioral equivalence uses the existing independent fixed-point partition refinement. Both depth-3 and depth-5 attacks start with a fresh machine in private state zero, avoiding state carry-over between compared conditions.

## Exact executable reproduction

- Node.js 22; no third-party libraries needed for the new simulator.
- Test: **node --test test/sco-sync-independent-distribution.test.js**.
- Four 40-model seed streams: **node sims/sco-sync-independent-distribution.js** and **node sims/sco-sync-independent-distribution.js --holdout**.
- Extended optional 100-model-per-stream experiment: append **--stress** to each command.
- Strict JSDoc inclusion: **npx tsc -p jsconfig.sco-oracles.json**.
- Generator/attacker/evaluator: [sims/sco-sync-independent-distribution.js](../sims/sco-sync-independent-distribution.js). Exact-sample regression: [test/sco-sync-independent-distribution.test.js](../test/sco-sync-independent-distribution.test.js). Existing attack unchanged: [sims/sco-sync-diversified.js](../sims/sco-sync-diversified.js).

Base streams use (0xa82b11f5, 4973), (0x4d90e2c7, 14057); held-out streams use (0x51a9c603, 8467), (0x7e2df0b1, 12289), each with unsigned seed = base + index × stride. Four streams × 40 cases = 160 independent private models for each hidden-state count and suffix depth. These are published fixed samples, not pre-registered external holdouts.

## Observed local Node 22.16.0 results

| Hidden states | Suffix depth | Models | Proposed words | Physically global | Behaviorally global | Post-discovery observable | False post-discovery | Public step calls |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 4 | 3 | 160 | 113 | 38 | 52 | 113 | 0 | 139,002 |
| 4 | 5 | 160 | 113 | 38 | 52 | 113 | 0 | 578,701 |
| 8 | 3 | 160 | 55 | 13 | 14 | 53 | 2 | 153,632 |
| 8 | 5 | 160 | 54 | 13 | 14 | 54 | 0 | 462,242 |
| 12 | 3 | 160 | 19 | 1 | 1 | 19 | 0 | 76,892 |
| 12 | 5 | 160 | 19 | 1 | 1 | 19 | 0 | 176,108 |

Suffix-depth 5 took **4.163×**, **3.009×** and **2.290×** as many public calls as depth 3 for the 4-, 8- and 12-state corpora respectively. These ratios concern attacker oracle queries, outside the protected-code 2.5× execution budget. No claim about target runtime performance follows.

A fixed seed 0x31415926, eight-state witness yields the same proposed one-symbol word [1] at both depths. At depths 3 and 5 the attacker makes 767 and 3,954 calls respectively. The proposed word converges neither all physical states nor all observational classes. It is nevertheless observationally consistent for states reachable from the private continuation state after the discovery transcript. The regression pins this surprising distinction.

For the four eight-state streams, suffix-depth 3 returned two post-discovery false candidates; depth 5 returned zero on the sampled distributions, with one fewer candidate overall. This is a finite test result and should not be extrapolated into a deterministic correctness guarantee. A no-reset black-box attacker can lose access to transient states while searching; any finite transcript can leave unreachable private-state behavior unidentified.

## Interpretation and limits

The independent fixture family checks the same public attacker outside its original LCG-derived distribution. It recovers many plausible short reset words for the 4-state machines even though global physical or observational synchronization is much rarer. Larger hidden-state counts reduce the candidate frequency under the fixed maximum 3-symbol word and chosen schedule, but this alone provides no generalized defense against an adversary with unlimited authorized SCO requests. Authorized relaying of an online server-private operation remains possible regardless of whether synchronization search succeeds.

This study did not invoke a deployed network RPC or Chromium; prior real authenticated RPC/browser studies in [the diversified SCO attack report](sco-diversified-sync-observability-2026-11-15.md) cover the original fixture family. SHA-256 is only used to generate hidden-state test fixtures, so the experiment says nothing about cryptographic key recovery. There is no statistical confidence interval, universal random-machine theorem, adversarially chosen machine family, independent second implementation of the attacker, or demonstrated reduction of the protected SCO workload's compute cost. Keep these observations in intermediate results.
