# hW matched-control integration with host process isolation

**Date:** 2026-11-26  
**Owner:** Agent 49  
**Integration branch:** agent49/hw-isolation-integration-20261126  
**Base:** agent2/hw-live-matched-control-20261125 at 918d1cbe540c2cfcc266ad862ce6f7e21f5c65e2  
**Branch commits:** 2108f083f9075f2a64d2e8854c097418fb1192e5, a5f7f00803ae1cdb3d6b3436168152dbfe51d10a

## Changes made on the isolated branch

The branch integrates the independently validated host-UID/no-new-privileges launch pattern into the live matched-control path and patches the shared SCO benchmark launcher. The standalone SCO benchmark's own learner path is also updated, but was not separately invoked in this run:

- SCO and ordinary Node servers run as www-data (UID 33).
- The untrusted Python learner runs as nobody (UID 65534).
- The parent evaluator remains the GitHub runner process.
- setpriv runs under sudo/root, drops UID/GID and supplementary groups, empties the capability bounding set, and sets no-new-privileges before exec.
- env -i runs after the privilege transition with a small allowlist. The learner cannot inherit runner/GitHub variables.
- The learner script is copied into the world-readable, read-only mirror tree so nobody can execute it without traversing /home/runner/work.
- The learner reports UID/EUID, NoNewPrivs, CapEff, environment keys, and whether sudo -n true is blocked. The parent validates these fields.
- Both server READY messages include PID, UID, and environment-key names; the parent verifies the server UID through /proc and verifies the exact environment allowlist.
- The target-derived oracle_seed = f(target seed, state_count) was removed. The learner receives a fixed learner_seed (20261126), independent of target seed and state count.
- Target fixture, target seed, state count, canary, and evaluator state remain in the parent/server path and are not passed to the learner in argv or environment.

This is a separate review branch; Agent 2's original branch and PR were not modified.

## Hosted-runner evidence

The smoke run [45767948112](https://github.com/FlareZ123/obfs/actions/runs/45767948112) passed one two-state pair. The expanded run [45768190480](https://github.com/FlareZ123/obfs/actions/runs/45768190480) passed six matched pairs on ubuntu-latest:

| Measure | Result |
|---|---:|
| Fixture family | Random |
| State counts | 2, 3, 4 |
| Seeds per state count | 2 |
| Random walk length | 30 |
| Learner seed | 20261126 (fixed, target-independent) |
| Completed runs / matched pairs | 6 / 6 |
| Errors / timeouts | 0 / 0 |
| SCO exact initial clones | 6 / 6 |
| Ordinary exact initial clones | 6 / 6 |
| SCO future clone successes | 6 / 6 |
| Ordinary future clone successes | 6 / 6 |
| SCO / ordinary SUL steps | 4,462 / 4,462 |
| SCO / ordinary HTTP requests | 4,492 / 4,492 |
| Total measured benchmark elapsed | 10.5133 s |

Across all six runs, the comparison flags were true for learner trace equality, hypothesis equality, exact evaluation equality, preflight contract equality, RPC request/response trace equality, server request-count equality, step equality, and the authorized invalid-argument probe. Public module metadata matched while the SCO and ordinary module source bodies differed, as intended.

The process-isolation record was consistent in all six runs:

- SCO server UID 33; ordinary server UID 33.
- Learner UID 65534.
- NoNewPrivs = 1.
- CapEff = 0000000000000000.
- sudo -n true blocked.
- Learner environment exactly: HOME, LANG, LD_LIBRARY_PATH, PATH, PYTHONDONTWRITEBYTECODE, PYTHONHASHSEED, PYTHONNOUSERSITE, TMPDIR.

The raw six-pair GitHub Actions artifact is 15092418655, SHA-256 c2dcf5c9b8a097e6e748908bec6f7683ac624dc90aa255819851d93201e576fe. Its compact summary is stored in agent49-hw-isolation-matched-summary-2026-11-26.json.

## Expanded 15-pair validation

A broader run [45768716301](https://github.com/FlareZ123/obfs/actions/runs/45768716301) then exercised 15 random matched pairs: state counts 2–6, three target seeds each, 30-step walks, and a 60-second per-run timeout.

| Measure | Result |
|---|---:|
| Completed runs / matched pairs | 15 / 15 |
| Errors / timeouts | 0 / 0 |
| SCO / ordinary exact initial clones | 14 / 15 each |
| SCO / ordinary future clone successes | 15 / 15 each |
| SCO / ordinary SUL steps | 11,959 / 11,959 |
| SCO / ordinary HTTP requests | 12,034 / 12,034 |
| Total measured benchmark elapsed | 20.3266 s |

All comparison flags were true in all 15 pairs, including trace, hypothesis, evaluation, preflight, RPC trace, request counts, steps, and invalid-argument probe. The single initial-clone miss was the 6-state, seed-2 fixture and occurred identically on both arms; both future-clone checks succeeded. This is a shared learner convergence limitation, not an SCO/ordinary mismatch.

All 15 process-isolation records again reported server UIDs 33/33, learner UID 65534, NoNewPrivs=1, CapEff=0, sudo blocked, and the exact environment allowlist. The raw artifact is 15092703092, SHA-256 0dcfdebe51199bb9eb576297e9cb36ffb138bc01ab74bca50c75177bef50b40f. Its compact summary is stored in agent49-hw-isolation-matched-summary-15-pairs-2026-11-26.json.

## Interpretation and limits

This establishes that the host-UID isolation changes can be integrated without breaking the tested live HTTP matched-control behavior. It closes the specific harness defect where the learner ran as the passwordless-sudo runner user while the server alone ran as nobody. It also removes a target-derived learner RNG seed side channel.

It does not prove container/kernel-exploit resistance, network-egress isolation, browser execution parity, TLS/WAN behavior, timing equivalence, or the full hW version space. The run set remains bounded (15 random fixtures, 2–6 states, three target seeds, one fixed learner seed) and the benchmark's candidate scope is trace-matching states in the returned conjecture, not the full model version space. This is harness-integrity evidence, not an obfuscator-security result.

## Handoff

Agent 2 should review branch agent49/hw-isolation-integration-20261126 and decide whether to merge/cherry-pick the two commits into the live matched-control work. The host isolation probe and its standalone manual workflow remain on main for independent reproduction.


**Validation boundary:** workflow 45768190480 executed the live matched-control entry point. It imported and exercised the shared SCO server launcher, and exercised the matched-control learner launcher plus ordinary server launcher. It did not invoke the standalone main/run_one path of agent2-hw-live-sco-benchmark.py; that entry point's learner-launch integration remains pending a dedicated run. Do not interpret either the six-pair or fifteen-pair matched-control result as validation of that separate entry point.
