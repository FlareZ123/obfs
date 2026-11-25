# Seven-direction restart-aware witness integration

**Date:** 2026-11-25  
**Owner:** Agent 50  
**Status:** intermediate research evidence; PR #373 remains draft and research-only

## Scope

This addendum integrates Agent 2's restart-aware seven-direction witness-search policy into the rank-five projected-affine learner used by draft PR #373. It does not change the learner's default: the existing six-direction policy remains the default for pre-existing peer simulations, while the live HTTP adapter explicitly selects the optional seven-direction policy.

The source promise remains the frozen 32-bit function

`F(x) = L(x) XOR h(Px)`

with rank-five P and a nonzero degree-five table coefficient. The full frozen-source SHA-256 is `2b6a7b2cb348cd716e636e8e2da0817d4721a95f98bd45bbd90ffd8a5b366a9d`; the top coefficient is `0xb1f2257d`.

## Exact fixed-order calculation

The policy draws seven independent uniform vectors in GF(2)^32 and tests the ten five-dimensional faces in this order:

`(0,1),(0,2),(0,3),(0,4),(0,5),(1,6),(2,6),(3,6),(4,6),(5,6)`.

Each pair denotes the two omitted direction coordinates. This is the K_{2,5} double-star order. The learner restarts after ten unsuccessful faces.

For a uniform full-rank 5×7 projection, the kernel is a uniform 2D subspace of GF(2)^7. There are exactly 2,667 such subspaces. The query-union DP counts coordinate-subset masks as distinct points. This is the injective-subset-sum query-cost model; it uses the exact projected-matrix/kernel failure probabilities while assigning the no-collision union cardinality to each face state. Actual uniform 32-bit directions can have dependencies, which only merge query points, so the DP values are unconditional upper bounds on query cost. Under this model, enumerating the kernels gives:

| Quantity | Exact value |
|---|---:|
| Probability projection has rank 5 | 26,043,255 / 33,554,432 |
| Ten-face success probability | 24,519,915 / 33,554,432 |
| Ten-face failure probability, including rank-deficient matrices | 9,034,517 / 33,554,432 |
| New query counts per face | 32, 16, 8, 4, 2, 16, 8, 4, 2, 1 |
| Union of subset-sum vertices in one full trial | 93 |
| Expected queries in a fresh trial (injective-subset-sum model) | 1,040,519,433 / 16,777,216 |
| Expected queries across restarts (same model) | 2,072,004,349 / 24,519,915 = 84.50291728172793 |

The repeated-trial objective accounts for the zero vertex being cached across trials:

`Q = (E - f) / (1 - f)`.

The six-direction full-face policy has injective-model repeated-trial expectation `1,706,867 / 19,845 = 86.00992693373645` under the same injective-subset-sum model. The specified seven-direction order therefore saves 1.50700965200852 expected witness queries in that model. This is a modest, narrow query-count improvement.

For unconditional uniform 32-bit direction draws, a linear dependence among seven directions has probability `1 - product_{i=0..6}(1 - 2^(i-32)) = 2.9569491454884723e-8`. Such dependencies can only merge subset-sum points, so the DP values remain unconditional upper bounds on query cost. A crude bound on the seven-direction expectation correction is `18 * 93 * 2.9569492e-8 < 4.95e-5` queries; the six-direction analogue is `< 2.50e-5`. The correction is far smaller than the 1.507-query gap and cannot affect the stated worst-case caps, which also remain upper bounds.

At delta = 1e-10, 18 seven-direction trials are required: `f^18 = 5.5308370176e-11`, while 17 trials do not meet the target. For n=32:

| Seven-direction path | Distinct-query cap |
|---|---:|
| Witness search (18 trials; 93 first-trial vertices, at most 92 new per later trial) | 1,657 |
| Fixed-pair shift path (plus 96 shift probes and 726 verifier samples) | 2,479 |
| Five-signature path (plus 992 signature probes and 726 verifier samples) | 3,375 |

The six-direction caps remain 1,675 witness / 2,497 shift / 3,393 signature queries, with 27 trials and a miss bound of approximately 4.3580153939e-11. The Reed-Muller verifier false-accept bound remains `(31/32)^726 = 9.7657468774e-11`, under the fixed degree-at-most-five oracle and independent verifier-draw assumptions.

## Reproducibility and evidence

### Exact DP and independent fixed-order check

Agent 2's C++ DP enumerates all 2^21 face states and all 2,667 2D kernels, optimizing fixed cutoffs with a Bellman/Dinkelbach recurrence. It is the source for the global-optimality claim within the fixed-cutoff face-search family. See:

- `sims/agent2-rankfive-witness-restart-dp.cpp`
- `im-results/agent2-rankfive-restart-aware-seven-direction-cutoff-2026-11-24.md`

Agent 50 added an independent standard-library Python check on the PR branch:

- `sims/agent50-rankfive-seven-direction-fixed-order-check.py`
- Branch: `agent50/rankfive-top-quintic-http-20261124`

It independently enumerates the 2,667 RREF kernels and recomputes the six- and seven-direction fixed-order expectations with exact Fractions. Its coordinate-mask query union has the same injective-subset-sum condition; the reported expectations are exact values in the injective query-cost model and unconditional upper bounds for actual 32-bit draws. It checks the face-union increments, E7, f7, Q7, the six-direction comparator, the 18-trial threshold, and the 1,657 / 2,479 / 3,375 caps. It explicitly does not claim to re-prove global optimality over all face orders.

### Exact-source Node replay

Agent 2's 10,000-replicate exact-source Node replay passed all source/oracle, fixed-pair, and verifier checks. It observed mean total distinct queries 906.4387 versus exact-DP theoretical mean 906.5029 (sample SD 67.9124, SE 0.6791); mean witness trials 1.3693; all 10,000 source/oracle equivalence checks passed. This is a deterministic SHA-counter simulation, not CSPRNG evidence. See `im-results/agent2-rankfive-restart-seven-direction-node-replay-2026-11-25.md`.

### Peer workflow

Peer workflow [45525969219](https://github.com/FlareZ123/obfs/actions/runs/45525969219) passed on Ubuntu and Windows at branch head `078b837829dab9281c7eea4f7264817621e88d3c`. It ran the independent exact Python check (including the full-direction dependence correction bound), strict JSDoc/syntax, 32 seven-direction finite cases covering 3,840 truth-table outputs, and an 18-trial no-witness fallback that exactly reconstructed all 128 width-seven inputs. On Ubuntu it also fetched the exact pinned Agent 2 DP source blob `0daaa5cd167502de15702bad780f31f901a25e71`, compiled and ran the exhaustive 2^21-state C++ DP, and asserted the output `best_cutoff=10 best_expected_witness_queries=84.502917281728`. The pre-existing six-direction peer/simulation suites also passed; those simulations continue to use the default six-direction policy.

Artifacts: Ubuntu `14983065422`; Windows `14982073432`.

### Live SCO/native HTTP workflow

Live HTTP workflow [45523876057](https://github.com/FlareZ123/obfs/actions/runs/45523876057) passed on Ubuntu and Windows at implementation head `5bcc53fde5687fba948abbefaed995cf01f8157c`. The adapter explicitly selected `seven-direction-restart`; each platform ran ten live SCO/native HTTP replicates against the pinned source. Source-pin, fixed-pair, no-fallback, 726-verifier, candidate-ready tape-release, transcript, authorization, and heldout checks passed.

The reported means are descriptive baseline-versus-hybrid comparisons using independently generated CSPRNG tapes between arms. They are not matched-pair inference and do not isolate the seven-versus-six policy effect:

| Platform | Baseline mean queries | Seven-direction hybrid mean | Descriptive mean difference |
|---|---:|---:|---:|
| Ubuntu (10 replicates) | 2,099.9 | 919.8 | 1,180.1 (56.20%) |
| Windows (10 replicates) | 2,036.8 | 908.6 | 1,128.2 (55.39%) |

Artifacts: Ubuntu `14982095443`; Windows `14980613871`.

The live HTTP sample validates integration on the fixed fast path. It is too small and too noisy to resolve a roughly 1.5-query expected difference between six- and seven-direction policies. Pre-candidate exact ANF fallback is covered by local peer controls, not by this HTTP run.

## Limitations and disposition

- The DP result is a narrow combinatorial statement about this fixed rank-five projected-affine witness family, not arbitrary JavaScript. Its query-cost optimum is exact in the injective-subset-sum query-cost model; for unrestricted 32-bit draws the values are conservative upper bounds because rare full-direction dependencies only merge queried points.
- The Node replay is deterministic simulation; the live HTTP test validates the selected fast path and does not establish a statistical seven-versus-six advantage.
- No CPU, wall-clock target-runtime, memory, initialization, or 2.5x compute-budget measurement was added.
- No conclusion follows for COO/SNO, static reconstruction, dynamic instrumentation resistance, tamper resistance, domain locking, or product release readiness.
- The worker and local HTTP server remain in one Node process; this is not OS-process isolation.
- The result remains in `im-results/`. Do not promote it to `results/`, rebase or merge PR #373 to reduce backlog, or change the project-wide **RELEASE-BLOCKED** decision.
