# Agent 49: four-target replication of 16–24-state hW reconstruction

**Date:** 2026-11-26  
**Status:** Intermediate empirical evidence; not an established security result.  
**Source branch/head:** `agent49/hw-state-scaling-20261126` at `a385fccda3b495a099ee91ca51691fff2a1b3c70`  
**Workflow:** [45792350960](https://github.com/FlareZ123/obfs/actions/runs/45792350960) — success  
**Artifact:** ID `15103621200`, SHA-256 `97cabcde861b7ff5ef6e031d25ee3bb7749fd4a4cabc258773dc3a455cfcfa3b`  
**Raw JSON SHA-256:** `5c4e3d704736a58eefebbfebb11cf7b5cb2d507315e427468044a94b044f5bb9`

## Question

Does the hW learner's future-behavior reconstruction persist across a broader sample of randomized targets from 16 through 24 states, rather than a single target per size?

## Exact experiment

- 36 targets: four independent target seeds at each state count 16–24.
- Target seeds were 64-bit values drawn with `secrets.randbits(64)`; all 36 were unique and are recorded in the summary JSON and raw artifact.
- Learner seed fixed at 41342 for all targets and shared within each SCO/ordinary pair.
- AALpy 2.0.0; random walk length 30; 20 origin states; 60-second per-arm timeout.
- Target seed and fixture state count were not passed to the learner.
- The SCO and ordinary HTTP arms ran sequentially with distinct session tokens. The workflow asserted matched learner traces, hypotheses, RPC traces, request counts, and evaluator outcomes.

**Generator qualification:** “random” here means a restricted generated family, not uniform sampling from all binary Mealy machines. Input 0 is a directed cycle; input 1 transitions and output pairs are pseudorandom; fixtures are filtered for minimality. The directed cycle makes the transition graph strongly connected. The generator and hW algorithm were not changed by this experiment; only the CLI cap was raised from 12 to 24, with deterministic 16/24 fixture tests added.

## Results

| States | Targets | Exact initial clones | Future-behavior clones | Initial ambiguities | SUL steps: median (range) | Learner wall median |
|---:|---:|---:|---:|---:|---:|---:|
| 16 | 4 | 2/4 | 4/4 | 2 | 3,040.5 (1,393–4,122) | 0.849 s |
| 17 | 4 | 4/4 | 4/4 | 0 | 1,772.5 (1,412–46,105) | 0.512 s |
| 18 | 4 | 4/4 | 4/4 | 0 | 1,709 (1,507–3,564) | 0.584 s |
| 19 | 4 | 2/4 | 4/4 | 2 | 3,727.5 (1,397–11,091) | 1.033 s |
| 20 | 4 | 3/4 | 4/4 | 1 | 2,853 (1,479–6,729) | 0.749 s |
| 21 | 4 | 2/4 | 4/4 | 2 | 2,084.5 (1,786–14,530) | 0.607 s |
| 22 | 4 | 3/4 | 4/4 | 1 | 6,593 (2,217–11,359) | 1.644 s |
| 23 | 4 | 3/4 | 4/4 | 1 | 1,924 (1,577–6,036) | 0.663 s |
| 24 | 4 | 2/4 | 4/4 | 2 | 2,289 (2,122–2,435) | 0.700 s |

Aggregate:

- **36/36** completed; zero timeouts and zero errors.
- **36/36** matched SCO/ordinary pairs.
- Exact initial-state clone: **25/36** in each arm.
- Future-behavior clone: **36/36** in each arm.
- Eleven initial ambiguities; zero future-behavior ambiguities. Every returned hypothesis was complete and had one post-trace behavior class.
- Zero false initial or future convergence.
- **172,847** SUL steps and **173,027** HTTP requests per arm.
- Median steps per target: **2,169.5**; mean: **4,801.3**; range: **1,393–46,105**.
- Median learner wall time: **0.644 s**; maximum: **10.136 s**.
- Total workflow-reported elapsed time: **115.2291 s**.

The 17-state outlier (target seed `17318051094464085863`) required 46,105 SUL steps and 10.136 seconds, versus 1,412–4,122 steps for the other three 17-state targets. It did not time out. The query-count distribution is heavy-tailed and non-monotonic; this sample does not establish a scaling law. Reconstructing the seeded fixtures with the generator logic showed the outlier was accepted on the first generation attempt and had maximum pair-distinguishing length 4, so that simple metric does not explain its query count. The cause remains open.

## Interpretation

For this restricted finite-state API family and this fixed hW learner configuration, every one of the 36 targets yielded a future-behavior clone. Eleven targets did not yield a unique exact initial state, but all trace-consistent candidates in the returned hypothesis had the same post-trace behavior.

The ordinary HTTP control produced identical reconstruction outcomes and matched traces. This is evidence of **no measured incremental functional-reconstruction resistance from the generated SCO partitioning over the matched ordinary HTTP service for this family**. All steps were authorized; this is not an authentication bypass or a source-extraction result.

## Limitations

1. Restricted binary Mealy family, not arbitrary JavaScript, multi-file applications, or a representative production workload.
2. One learner RNG seed, four target seeds per size. Learner-seed sensitivity remains untested.
3. Evaluator certifies candidates in the returned hW hypothesis, not the complete version space of all machines consistent with the trace.
4. Local HTTP only; no TLS, WAN, browser, or separate network namespace.
5. The sequential probe at this source pin scanned exact IPv4 `127.0.0.1` listeners only. A subsequent branch revision expands listener discovery to IPv4/IPv6 loopback and wildcard endpoints; that revision still requires hosted validation.
6. Learner wall time includes local HTTP interaction and is not original-function CPU time. No original-local-JavaScript CPU comparison was performed; **no conclusion about the 2.5× compute budget follows**.

## Reproduction and retained evidence

Run `manual-agent2-hw-live-matched-control.yml` at the exact source head above with `fixture_family=random`, `min_states=16`, `max_states=24`, `seeds=4`, `target_seed_mode=random`, `timeout_seconds=60`, `random_walk_length=30`, `origin_states=20`, and `learner_seed=41342`.

- Per-size aggregates and all 36 target seeds: `im-results/agent49-hw-random-scaling-16-24-4seeds-2026-11-26.json`.
- Full per-run result JSON and probe output: workflow artifact 15103621200 (artifact expiry 2027-02-24).
- This is intermediate evidence and remains in `im-results/`, not `results/`.
