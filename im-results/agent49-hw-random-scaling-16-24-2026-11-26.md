# Agent 49: random hW reconstruction through a 24-state private SCO API

**Date:** 2026-11-26  
**Status:** Intermediate empirical evidence; not an established security result.  
**Source branch:** `agent49/hw-state-scaling-20261126`  
**Exact source head:** `a385fccda3b495a099ee91ca51691fff2a1b3c70`  
**Branch base:** `agent49/hw-cross-arm-probe-20261126` at `8b0db72f22c636ce73ecd6d49a1af5bcf774908d`  
**Workflow:** [45791869705](https://github.com/FlareZ123/obfs/actions/runs/45791869705) — success  
**Artifact:** `agent2-live-hw-matched-control`, ID `15103515365`, SHA-256 `b1b5d3e7dc0347eb6c2a7325dd9304ebd9523050d781677ad1470b27a08b40ef`

## Question

Does the isolated no-reset hW learner continue to reconstruct a private finite-state SCO API when the random minimal strongly-connected binary Mealy machine grows beyond the previous 12-state fixture limit?

## Source changes

The prior random-fixture maximum of 12 was an explicit CLI guard, not a restriction in the fixture generator or evaluator. This branch raises the matched-control random-fixture limit to 24, updates the workflow input description, and adds deterministic generator/evaluator tests for 16- and 24-state fixtures (seeds 0 and 41342). The machine-generation algorithm, AALpy hW learner, SCO compiler/server path, evaluator, and ordinary HTTP control are unchanged.

The new unit test verifies that each added fixture is strongly connected, minimal, has a valid initial state, and is byte-for-byte reproducible from its seed.

## Experiment

- Fixture family: random minimal strongly connected binary Mealy machines.
- Target sizes: 16 through 24 states, one independently generated target per size (nine total).
- Target seeds: independent 64-bit values from `secrets.randbits(64)`; exact values are retained in the artifact below.
- Learner seed: fixed 41342, independent of target seed and state count, and shared across matched arms.
- The target seed/state count are not passed in learner argv or environment. The parent evaluator retains the target; the server receives the machine over its private stdin pipe.
- The SCO and ordinary arms execute sequentially, never concurrently. They use different session tokens, independent random partition seed/canary values, and the same fixture and learner seed.
- Server UID 33; learner UID/EUID 65534. The hosted checks verified NoNewPrivs=1, empty CapEff/CapBnd, blocked sudo, a scrubbed environment, and one visible IPv4 loopback listener per single-arm probe.
- Each learner interacts through the public HTTP module and authorized step RPC. The evaluator is parent-side and is not passed to the learner.

## Results

| States | 64-bit target seed | SUL steps per arm | Learner wall time (s) | Exact initial clone | Future-behavior clone | Trace candidates | End behavior classes |
|---:|---:|---:|---:|:---:|:---:|---:|---:|
| 16 | 4269118928701642002 | 5,813 | 0.932 | Yes | Yes | 1 | 1 |
| 17 | 5536362526029781726 | 3,930 | 0.686 | Yes | Yes | 1 | 1 |
| 18 | 18392633940757105054 | 2,779 | 0.540 | No | Yes | 2 | 1 |
| 19 | 10055748014551959702 | 2,324 | 0.428 | Yes | Yes | 1 | 1 |
| 20 | 13708751775789319155 | 1,531 | 0.349 | No | Yes | 2 | 1 |
| 21 | 4210004134186406821 | 2,308 | 0.437 | No | Yes | 2 | 1 |
| 22 | 3551056589441254141 | 1,950 | 0.417 | Yes | Yes | 1 | 1 |
| 23 | 16006049726605515238 | 6,322 | 1.152 | Yes | Yes | 1 | 1 |
| 24 | 2244106383915602405 | 7,942 | 1.299 | Yes | Yes | 1 | 1 |

Aggregate:

- **9/9** runs completed; zero timeouts and zero errors.
- **9/9** SCO/ordinary pairs matched.
- Exact initial-state clone: **6/9** in each arm.
- Future-behavior clone: **9/9** in each arm.
- All nine returned hypotheses were complete and had one post-trace behavioral equivalence class.
- The three initial ambiguities (18, 20, 21 states) each had two trace-consistent initial candidates, but both candidates reached the same future-behavior class. They are not counted as exact initial clones.
- False initial convergence: 0; false future convergence: 0.
- **34,899** SUL steps and **34,944** HTTP requests per arm.
- Total workflow-reported elapsed time: **18.8399 s**.

The matched-control assertions verified equal learner traces, returned hypotheses, normalized RPC request/response traces, server request counts, evaluator outcomes, and step counts. Public module bodies differed as expected. Session tokens were distinct. The sequential single-arm probes reported no alternate service on the tested IPv4 loopback interface during either arm.

## Interpretation

For this finite-state API family and this one hW learner configuration, an authorized client reconstructed future behavior for every tested 16–24-state target. Exact initial-state identification was not universal: three runs retained two initial candidates, while their post-trace behavior was nevertheless unambiguous.

The conventional HTTP control produced the same learner behavior and evaluator outcomes as the SCO arm. Thus this experiment measures **no incremental functional-reconstruction resistance from the generated SCO partitioning over the matched ordinary HTTP service for these nine fixtures**. It does not test unauthorized access; all successful steps used the legitimate session cookie and public RPC contract.

This extends the earlier one-case 12-state observation to nine random targets between 16 and 24 states. It is not a scaling law: there is only one target per size, and the query counts are non-monotonic across this small sample.

## Limitations

1. The target is a finite, deterministic, binary Mealy machine, not arbitrary JavaScript or a representative multi-file application.
2. The attacker is one configured AALpy 2.0.0 hW learner with a fixed learner seed, 30-step random walks, and 20 origin states. This does not exhaust adaptive strategies or unlimited-query attackers.
3. The evaluator checks trace candidates in the returned hW hypothesis, not the complete version space of every machine consistent with the trace.
4. Host-level UID separation and process checks are not a separate VM/container or network namespace. The probe enumerates `/proc/net/tcp` IPv4 loopback listeners; it does not prove the absence of every possible service on every interface or protocol.
5. This is local HTTP, not TLS, WAN, or browser execution. The measured learner elapsed times include the configured local HTTP interaction and are not original-function CPU measurements.
6. No comparison against original local JavaScript CPU was made. **No conclusion about the 2.5× compute budget follows.**
7. No claim is made about source extraction, universal SCO confidentiality, domain locking, tamper resistance, COO/SNO, or arbitrary application reconstruction.

## Reproduction

Run the manual `manual-agent2-hw-live-matched-control.yml` workflow at the exact source head above with:

```text
fixture_family=random
min_states=16
max_states=24
seeds=1
target_seed_mode=random
timeout_seconds=120
random_walk_length=30
origin_states=20
learner_seed=41342
```

The raw per-run JSON and sequential-isolation probe JSON are preserved in artifact 15103515365. Keep this report in `im-results/`; it is intermediate evidence, not a promotion candidate.
