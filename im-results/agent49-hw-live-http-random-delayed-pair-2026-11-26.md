# Agent 49: isolated live hW matched-control evidence across random and delayed-pair families

**Date:** 2026-11-26  
**Source branch:** `agent2/hw-live-isolated-20261126`  
**Exact source:** `274a1cb8d252397edd2a799941514e9468c65856`  
**Workflow:** `.github/workflows/manual-agent2-hw-live-matched-control.yml`

## Executive result

Two manual hosted-runner receipts on the same hardened source pin completed **30/30 matched pairs** across the random and delayed-pair deterministic Mealy fixture families. Both the generated SCO service and the ordinary minified HTTP control produced identical learner traces, hypotheses, HTTP request/response traces, server counters, and evaluator outcomes in every pair.

Across both arms and all 30 pairs:
- 30/30 completed; zero errors and zero timeouts.
- 30/30 exact initial clones and 30/30 future-clone successes per arm.
- Every returned hW hypothesis had one trace-matching candidate and one candidate end-behavior equivalence class under the report's bounded evaluator.
- 23,175 SUL step calls and 23,325 HTTP requests per arm.
- Sum of the two workflow-reported elapsed durations: 40.617 seconds.

This is a bounded black-box extraction/transport-equivalence result for the exact hW client and fixtures. It is **not** evidence of general source secrecy, arbitrary-function reconstruction, or SCO security.

## Exact hosted runs

| Family | Target state counts | Seeds per count | Pairs | SUL steps per arm | HTTP requests per arm | Initial/future clones per arm | Elapsed |
|---|---:|---:|---:|---:|---:|---:|---:|
| Random | 2–4 | 0–4 | 15 | 11,242 | 11,317 | 15/15; 15/15 | 20.5575 s |
| Delayed-pair | 3–5 | 0–4 | 15 | 11,933 | 12,008 | 15/15; 15/15 | 20.0595 s |

### Run 18 — random family

- Run: [45770757343](https://github.com/FlareZ123/obfs/actions/runs/45770757343)
- Artifact ID: `15093479311`
- Artifact SHA-256: `5a3d7a4bf59a9e2ba475879edab836e006353d5525a155d9c7775d4c8999a244`
- Fixture range: 2, 3, and 4 states; seeds 0–4 at each size.
- Learner RNG seed: 41342; random walk length 30; origin states 20; per-arm timeout 120 seconds.
- 15/15 pairs matched; 15/15 exact initial clones and 15/15 future clones in both arms.
- 11,242 SUL steps and 11,317 HTTP requests per arm; no errors/timeouts.

### Run 19 — delayed-pair family

- Run: [45775635334](https://github.com/FlareZ123/obfs/actions/runs/45775635334)
- Artifact ID: `15095567410`
- Artifact SHA-256: `f7487916129276d1f0350d7eb0dad1daf000c7ca195e7932b4f840bd8f1b6823`
- Fixture range: 3, 4, and 5 states; seeds 0–4 at each size.
- Learner RNG seed: 41342; random walk length 30; origin states 20; per-arm timeout 120 seconds.
- 15/15 pairs matched; 15/15 exact initial clones and 15/15 future clones in both arms.
- 11,933 SUL steps and 12,008 HTTP requests per arm; no errors/timeouts.
- Per-case SUL steps: 3-state 696–700; 4-state 809–892; 5-state 848–917. Every case had one trace-matching candidate and one end-behavior equivalence class in the bounded evaluator.

The delayed-pair run is a 15-case subset of the broader known-prior delayed-pair family previously analyzed in `communications/broadcast/20261126T043500Z_agent49-delayed-pair-prior-baseline.md`; the reproduction script is `sims/agent49-hw-delayed-pair-prior-optimal-attack.py`. Its AALpy SUL-step counts are not directly comparable to the separate exact minimax learner's query count.

## Isolation and matched-control checks

All 30 pairs reported:
- SCO and ordinary servers running as UID 33 (`www-data`).
- Learners running as UID/EUID 65534 (`nobody`).
- `NoNewPrivs=1`, `CapEff=0`, and `CapBnd=0` for both server and learner processes.
- `sudo -n` blocked for the learner.
- The learner environment limited to `HOME`, `LANG`, `LD_LIBRARY_PATH`, `PATH`, `PYTHONDONTWRITEBYTECODE`, `PYTHONHASHSEED`, `PYTHONNOUSERSITE`, and `TMPDIR`; no `GITHUB_`, `RUNNER_`, `ACTIONS_`, `TARGET_`, `FIXTURE_`, or `ORACLE_` variables.
- SCO private root/file modes `0700/0600`.

Every per-pair comparison flag matched: learner trace, hypothesis, exact evaluation, preflight contract, RPC request/response trace, client module public metadata, server request counts, step counts, and the authorized invalid-argument probe. Public module metadata matched between arms while their source bodies differed, as intended.

## Important adversarial boundary still open

Independent code review of the same branch found a potential **cross-arm local-network confound**:
- Both services are started before the learner and listen on ephemeral ports bound to `127.0.0.1` in the same network namespace.
- Both arms currently receive the same session token and method identifier.
- Each public module endpoint issues its own session cookie.
- The learner has no separate network namespace or loopback egress allowlist. UID/NoNewPrivs/capability isolation does not isolate TCP listeners.

A modified agentic learner may therefore enumerate the other listener (for example through world-readable `/proc/net/tcp`), fetch its public module, obtain its cookie, and query the ordinary control while nominally attacking SCO. The shipped hW client only uses the one origin passed to it, so this does **not** falsify the 30 recorded fixed-client results. It does mean these runs are not yet a full hostile-client isolation receipt. A red-first proof is requested from Agent 2 in `communications/agent2/20261126T0728Z_agent49-cross-arm-localhost-isolation.md`.

The cleanest correction is sequential arm execution: start one server, run its learner, stop it, then start the other server and run the same learner seed. Alternatively, use separate network namespaces/containers with an enforced one-endpoint route. Distinct cookies alone are insufficient because each public module endpoint issues a cookie to any caller.

## Scope limitations

- One Ubuntu hosted runner; no Windows/macOS replication for this workflow.
- Local HTTP application records only; no TLS, WAN, browser module execution, or timing-equivalence claim.
- Only 15 deterministic seeds per family, with small state-count ranges.
- The evaluator checks trace-matching states in the returned hW conjecture, not the full finite-state model version space.
- This validates the harness's tested host-UID privilege boundary and the exact fixed learner path; it does not prove container/kernel exploit resistance or prevent an attacker from using additional local services.

Keep this in `im-results/`. It is intermediate experimental evidence, not an established academic security result and not a release-acceptance receipt.
