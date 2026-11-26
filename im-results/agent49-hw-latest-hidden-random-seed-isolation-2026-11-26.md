# Agent 49: latest sequential SCO harness with hidden target and partition seeds

**Date:** 2026-11-26  
**Source branch:** `agent49/hw-cross-arm-probe-20261126`  
**Source commit:** `8b0db72f22c636ce73ecd6d49a1af5bcf774908d` (latest branch head at dispatch)  
**Workflow run:** [45780885711](https://github.com/FlareZ123/obfs/actions/runs/45780885711)  
**Artifact ID:** `15097354059`  
**Artifact SHA-256:** `2570a7b8cc2e930e7ccad90865bb399db29a3fed3f2e8c638aa79e2e703c013b`

## Configuration

- Fixture family: random Mealy machines.
- State counts: 2, 3, and 4; five samples per state count.
- Target seeds: independent 64-bit values from `secrets.randbits(64)`.
- Learner RNG seed: 41342, same for both matched arms.
- Target seed and state count were not passed to learner argv or environment.
- SCO partition seed and private canary were independently generated with `secrets.token_urlsafe(32)`; the target-seed argument was removed from the SCO launcher API.
- Arms ran sequentially: SCO completed and stopped before the ordinary control started.
- Learner isolation: UID/EUID 65534, NoNewPrivs=1, zero effective/bounding capabilities, blocked sudo, scrubbed environment.

## Results

- 15/15 matched pairs.
- **13/15 exact initial-state clones** in both arms.
- **15/15 future-behavior clone successes** in both arms.
- Zero errors and zero timeouts.
- 10,770 SUL steps and 10,845 HTTP requests per arm.
- SCO/ordinary learner behavior and comparison results matched for every pair.
- The sequential single-arm probe passed for both arms; no alternate service was visible and session tokens were distinct.

Two cases had two trace-matching candidates with one end-behavior equivalence class:
- 3 states, target seed `9370742971956086794`.
- 4 states, target seed `15374430939080669429`.

In both cases the target's exact initial behavior remained among the candidates, but the learner's observed trace did not distinguish it from one alternative initial candidate. The candidates were future-equivalent after the observed trace, so future clone success remained true. These are initial-state ambiguity cases, not false convergence. The other 13 cases had one candidate and exact initial clone success.

## Per-arm HTTP step latency

The client recorded per-request roundtrip latency (Python HTTP client to local Node server):

| Metric | SCO | Ordinary control |
|---|---:|---:|
| Weighted mean | 0.3113 ms | 0.2687 ms |
| Mean of per-case p50 | 0.3065 ms | 0.2600 ms |
| Mean of per-case p95 | 0.3998 ms | 0.3704 ms |
| Maximum single observation | 2.771 ms | 1.918 ms |

The SCO/control mean ratio was about 1.159 for this local harness. This is an API-to-API comparison, not the required comparison against original local JavaScript execution; see `im-results/agent49-sco-rpc-overhead-microbench-2026-11-26.md` for a separate synthetic local-function/HTTP lower-bound analysis.

## Target seeds

| States | Target seed |
|---:|---:|
| 2 | 8391712266042629370 |
| 2 | 3533914956264154950 |
| 2 | 14163586342924963519 |
| 2 | 17749030344044795304 |
| 2 | 15913492583818291144 |
| 3 | 6734975972387995320 |
| 3 | 1428053201927114242 |
| 3 | 9370742971956086794 |
| 3 | 15177427407596146262 |
| 3 | 81449404229269182 |
| 4 | 13921620312416425547 |
| 4 | 10474704401038943105 |
| 4 | 15374430939080669429 |
| 4 | 13579039611973042529 |
| 4 | 6627185898334305016 |

## Interpretation and limits

This is the first 15-case validation in which both target seeds and SCO partition seeds are independent random values and the two arms are isolated sequentially. It demonstrates that the fixed hW learner can clone future behavior for these small random machines without receiving the target seed. It does not establish exact initial-state identification in every case, arbitrary-JavaScript reconstruction, browser/WAN behavior, or production SCO security.

Keep this in `im-results/`; it is intermediate empirical evidence, not an established academic result.
