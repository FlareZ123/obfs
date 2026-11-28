# Agent 17: resetless hW attacker baseline for the three-state SCO minimax result

**Status:** reproducible CI experiment complete; live HTTP extension is being validated on a separate branch.  
**Code:** sims/agent17-hw-inference-baseline.py  
**Dependency:** sims/requirements-hw.txt pins AALpy 2.0.0.  
**Workflow:** .github/workflows/research-minimax.yml  
**Evidence run:** https://github.com/FlareZ123/obfs/actions/runs/46183867464  
**Evidence commit:** 8eb0059796561460d82f82fbc334fbb58f1bc54b

## Research question

The exact three-state result reports a 24-call worst-case policy for deterministic binary-input/binary-output Mealy machines with at most three states, known initial state zero, and no reset. That is a valuable bounded-class result, but it does not characterize the strength or cost of a general attacker that is not told the state count.

This experiment adds a published general-purpose resetless learner as an adversarial baseline rather than treating the 24-call result as a universal security statement.

## Prior art and implementation

Groz, Brémond, and Simão, “Using Adaptive Sequences for Learning Non-Resettable FSMs,” Proceedings of Machine Learning Research 93 (2019), pp. 30–43:
https://proceedings.mlr.press/v93/groz19a.html

Their hW-inference method learns non-resettable Mealy machines using adaptive homing and characterization sequences. It does not require the state count, but assumes a complete deterministic strongly connected machine. AALpy implements hW; version 2.0.0 includes hW counterexample-processing fixes:
https://github.com/DES-Lab/AALpy/releases/tag/v.2.0.0
https://pypi.org/project/aalpy/2.0.0/

The experiment uses AALpy 2.0.0 and its run_hW implementation with RandomhWOracle. The equivalence-oracle random-walk budget is swept over 32, 64, 128, and 256 steps per round. Two fixed Python random seeds (7 and 19) are used per model.

## Experimental contract

- The learner is given only the binary input alphabet and a step-only SUL.
- The SUL starts in state zero, but does not expose that label or the hidden state count to the learner.
- pre() and post() are no-ops. Successful runs assert exactly one initial pre and one final post; there are no resets between probes.
- query_for_initial_state=False avoids the optional final reset-based initial-state query.
- The SUL's private table and state are held in an evaluator closure. The hW learner only interacts through step(input) -> output.
- The benchmark includes the pinned table-52 three-state witness and reproducibly generated minimal strongly connected machines with 3, 4, and 5 states.
- The script counts every SUL step call, including bootstrap and equivalence-oracle calls.
- After learning, an evaluator-only BFS over the product of the returned hypothesis and the hidden machine checks exact future-behavior equivalence from their current states. It also returns a shortest counterexample when they differ.

The random-walk equivalence oracle is heuristic. A run that terminates with a wrong hypothesis is reported as false convergence rather than accepted as a successful clone. The evaluator product check is exact for the two finite machines.

## Results

**64 fixed-seed runs**

All 64 runs completed without exhausting the 20,000-step SUL cap. At the 64-, 128-, and 256-step oracle budgets, all 16 runs per budget were exactly equivalent under the evaluator's product check. At the 32-step budget, 15/16 were exact and one was a false convergence.

| Random-walk steps per equivalence round | Exact runs | False convergences | Three-state median calls | Three-state max calls | All-model median / max calls |
|---:|---:|---:|---:|---:|---:|
| 32 | 15/16 | 1 | 90.0 | 163 | 107.5 / 248 |
| 64 | 16/16 | 0 | 139.5 | 195 | 157.5 / 280 |
| 128 | 16/16 | 0 | 203.5 | 259 | 221.5 / 344 |
| 256 | 16/16 | 0 | 331.5 | 387 | 349.5 / 472 |

The false convergence at the 32-step budget is reproducible: generated-n3-seed5, oracle seed 7, 51 calls, learned hypothesis size 2 for a 3-state target. The evaluator found shortest distinguishing input [1, 1, 1]. This is direct evidence that the random-walk stopping rule can underfit even within the three-state class.

The pinned table-52 witness was exactly reconstructed at all four budgets and both random seeds. At 256 steps per round, its runs took 385 and 387 calls. The 3-, 4-, and 5-state generated cases were all exactly reconstructed at budgets 64 and above.

For the eight three-state runs at the 64-step budget, hW used 139.5 median and 195 maximum calls. The specialized exact policy guarantees at most 24 calls under its known at-most-three-state prior. The sample's raw query-count ratio is therefore about 5.8x at the median and 8.1x at the maximum. This is not a universal speedup theorem: the exact policy has stronger prior knowledge, while hW is a general unknown-state-count learner with a heuristic equivalence oracle.

The full per-run rows, including machine SHA-256 digests, homing sequences, characterization sets, call counts, and shortest false-convergence witness, are emitted as HWINFERENCE_RUN lines in the CI job log and preserved in the agent17-hw-inference-baseline artifact.

## Interpretation boundary

The 24-call policy and hW are not interchangeable algorithms:
- the 24-call policy has an exact worst-case guarantee under a known at-most-three-state prior;
- hW does not know the state count, relies on strong connectivity, and uses a bounded random-walk equivalence oracle;
- hW's raw call count therefore measures a general-purpose heuristic baseline, not an optimal-policy lower bound.

This is an offline SUL benchmark, not a process-isolation or live-HTTP claim. It does not establish a production SCO compromise, and it does not establish obfuscator security. The repository's release decision remains NO-GO / RELEASE-BLOCKED.

## Reproduction

From the repository root:

    python -m pip install -r sims/requirements-hw.txt
    python sims/agent17-hw-inference-baseline.py

The research workflow installs the pinned dependency and runs the same script on pushes affecting the experiment. The run above is source-pinned by its commit SHA and fixed machine/attacker seeds.

## Next work

A separate branch, agent17/sco-three-state-live-policy-acceptance-20261128, now repairs the live-policy test's deterministic blockers and adds a public behavior-quotient table. The separate attacker process uses the public policy and live RPC outputs to predict 64 held-out inputs. The parent evaluator closes each server before checking those predictions against its private state. The matched ordinary-minified RPC control receives the same policy, input sequence, and authentication boundary. Do not treat that branch as validated until its manual workflow passes on both Ubuntu and Windows and the artifact is inspected.

The next hW-specific step is to run the same resetless learner through the generated authenticated SCO HTTP facade and the equal-trust ordinary RPC control. That would turn the offline baseline into a real process-boundary comparison. Only add stronger equivalence oracles if they materially improve accuracy without obscuring the request-cost comparison.
