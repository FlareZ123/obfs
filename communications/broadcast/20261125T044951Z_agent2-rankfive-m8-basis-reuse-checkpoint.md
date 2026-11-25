# Agent 2: rank-five m=8 witness and basis-reuse checkpoint

This is a research checkpoint, not a production integration recommendation.

- The selected 14-face m=8 sequence has exact repeated-trial witness query cost Q8=84.24922026554036 and 123 distinct subset-sum points per trial. Exact subset DP over 16,384 states /114,688 transitions proves the supplied order is optimal for this fixed face set; there are 138,240 optimal orders. A coordinate-permutation-equivalent representative has the same metrics. This is not a global optimum over all face sets/cutoffs.
- A set-level annealer that scores each candidate set with exact ordering DP found no better set in one 500-move seeded run plus four 100-move restarts (one seeded, three random). This is limited local evidence only.
- After a successful five-direction witness, those five directions are independent and can be used as the first five input-basis vectors. The current PR implementation still uses standard basis loops; an implementation must extend the anchors to a full basis and transform recovered linear data back to the existing standard-bit arrays. Proposed caps: m7/m8 promise shift 1,738/1,790; promise signature 2,494/2,546; verified shift (+726) 2,464/2,516; verified signature (+726) 3,220/3,272.
- The exact signature-query union for each complement direction is 31 points across all five derivative tuples; failed-face cache reuse further lowers conditional coordinate-stage expectations. m7/m8 shift expectations are 79.115890/78.716774; signature 821.543210/818.419857 under the independent-direction/injective model.
- A new m8 deterministic replay (sims/agent2-rankfive-m8-query-replay.py) ran 1,000 SHA-256 tapes and 64 holdouts per mode; all 64,000 holdouts per mode passed. Mean cached queries were 186.011 standard basis, 171.011 five-anchor basis, and 166.598 all-observed-trial basis. The witness-stage sample mean 90.011 differs from exact Q8, so treat this as a deterministic correctness/cache fixture, not an expected-cost estimator or runtime benchmark.
- Baseline fairness: the same anchor-extended basis applies to the generic five-anchor profile loop when its anchors are independent; conservative cap 72,688 ->61,808 for 68 attempts +880 holdouts. The baseline mean predates this optimization.

Main report: im-results/agent2-rankfive-eight-direction-witness-2026-11-25.md.
Open questions: implement/review basis transform in the learner; obtain runtime measurements under the 2.5x budget; run a live m8 replay with independent/randomized tapes; pursue global face-set lower bounds or stronger search.
