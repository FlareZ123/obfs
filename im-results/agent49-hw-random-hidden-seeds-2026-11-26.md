# Agent 49: live hW extraction with hidden 64-bit target seeds

**Date:** 2026-11-26  
**Source branch:** `agent49/hw-cross-arm-probe-20261126`  
**Run source commit:** `0300cd9943f11293f6c7bd252340b201081abb05`  
**Workflow run:** [45778093431](https://github.com/FlareZ123/obfs/actions/runs/45778093431)  
**Artifact ID:** `15096807771`  
**Artifact SHA-256:** `988dbe6574fb19a6dd38d41f880bebd30efabe1867fe99e44f9838f34da82288`

## Result

The sequential matched-control harness completed **15/15 random Mealy-machine fixtures** generated from independent 64-bit target seeds. The learner received the same independent RNG seed (41342) for each arm but did not receive the target seed or target state count in argv or environment.

- State counts: 2, 3, and 4; five samples per state count.
- Target seed source: `secrets.randbits(64)`.
- Learner: separate Python hW client, UID/EUID 65534, scrubbed environment.
- SCO and ordinary servers: UID 33, NoNewPrivs=1, zero effective/bounding capabilities.
- 15/15 matched pairs.
- 15/15 exact initial clones and 15/15 future-clone successes in each arm.
- Zero errors and zero timeouts.
- 10,837 SUL steps and 10,912 HTTP requests per arm.
- Workflow-reported elapsed time: 25.4374 seconds.
- Every returned hypothesis had one trace-matching candidate and one end-behavior equivalence class in the bounded evaluator.
- Sequential single-arm isolation probe passed for both services; session tokens were distinct and no alternate local service was visible.

The 15 recorded target seeds (state count, seed) were:

| States | 64-bit target seed |
|---:|---:|
| 2 | 16307920845287030926 |
| 2 | 5505401985003125391 |
| 2 | 6335975487924605500 |
| 2 | 18130268236492806156 |
| 2 | 911246232274350073 |
| 3 | 12984378925481054622 |
| 3 | 16579058434896581056 |
| 3 | 13761830602221578815 |
| 3 | 11756705226867537539 |
| 3 | 18071309541061247999 |
| 4 | 2060013825519506074 |
| 4 | 13946351596490567489 |
| 4 | 7109425412808642358 |
| 4 | 355092417792775616 |
| 4 | 11905010671960917694 |

The artifact stores the fixture digest, target seed, exact per-arm request/response traces and hashes, learner hypotheses, evaluation outcomes, process isolation metadata, and the single-arm probe result.

## Interpretation

This is stronger than the earlier 15-case deterministic-seed sample: it shows the fixed hW learner can recover the tested small random Mealy machines without receiving the target seed, using only the live application oracle. The SCO and ordinary HTTP arms remain behaviorally equivalent under the tested learner.

It is not evidence of general reconstruction for arbitrary JavaScript, nor of resistance to static/dynamic analysis. The fixture range remains small (2–4 states), and the evaluator's candidate count is not the full finite-state version space.

## Important source-version limitation

This run used commit `0300cd9943f11293f6c7bd252340b201081abb05`. It had the random target-seed mode and sequential arm isolation, but the SCO partition seed/canary were still derived from the target seed. The subsequent branch commits `c8673168`, `c01ac609`, and `d3a7e025` decouple those values and remove the target-seed argument from the SCO launcher API. This run therefore does **not** validate that later decoupling; a run on the latest branch head is still required.

Keep this as intermediate evidence in `im-results/`. It is not an established academic result or release-acceptance receipt.
