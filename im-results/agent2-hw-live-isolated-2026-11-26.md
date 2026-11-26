# Isolated live hW SCO matched-control harness (2026-11-26)

## Status

The corrected harness has passed a hosted one-pair smoke test and a 40-case run. This is still an intermediate research harness, not a production obfuscator result or a general SCO-security proof. The old measurements in `im-results/agent2-hw-live-matched-control-2026-11-25.md` are explicitly invalidated as black-box security evidence.

## Implementation

Candidate branch: `agent2/hw-live-isolated-20261126`.

The corrected launch boundary is:

- Trusted evaluator/orchestrator: GitHub runner account. It owns the target fixture and target seed.
- SCO and ordinary Node servers: `www-data` (UID 33).
- Python hW learner: `nobody` (UID 65534).
- Children are launched through `sudo -n setpriv` with `--clear-groups --no-new-privs --bounding-set=-all`, followed by `env -i` and a small allowlist.
- The learner receives only the HTTP origin, public learner parameters, and `--learner-seed 41342`. This learner seed is fixed independently of target seed/state count and shared across paired arms.
- The former target-derived `--oracle-seed` was removed completely. Target seed/state count are not in learner argv or environment; the server receives the fixture over its private stdin pipe.
- The SCO server's private temp root and module directory/file are explicitly mode 0700/0600. The parent checks the root/file modes.
- Both server READY messages attest PID, UID, and environment keys. The learner reports PID, UID/EUID, environment keys, and (after the later hardening commit) NoNewPrivs, CapEff, CapBnd, and sudo-blocked status.
- The parent checks actual server UID and, after the hardening commit, kernel process status for NoNewPrivs and empty effective/bounding capability sets.
- The workflow runs the hosted cross-UID isolation probe before the benchmark.

Relevant code:
- `sims/agent2_hw_process_isolation.py`
- `sims/agent2-hw-live-sco-benchmark.py`
- `sims/agent2-hw-live-matched-control.py`
- `sims/agent2-hw-live-sco-client.py`
- `sims/agent2-hw-live-sco-server.js`
- `sims/agent2-hw-live-ordinary-server.js`
- `.github/workflows/manual-agent2-hw-live-matched-control.yml`

## Hosted validation

| Run | Scope | Result |
|---|---|---|
| 13 / 45768526573 | One random 2-state pair; initial UID/env/private-mode assertions and cross-UID probe | Success |
| 15 / 45769285479 | 40 scheduled random pairs: state counts 2–5, 10 target seeds each; 30-step random walk; learner seed 41342 | Workflow success; zero errors; every completed row passed paired-match and isolation assertions. Completed-vs-timeout counts have not yet been extracted. |
| 16 / 45770272628 | One random 2-state pair after adding actual NoNewPrivs/CapEff/CapBnd and sudo-denial assertions for both server and learner | Success |

Run 15's artifact is `agent2-live-hw-matched-control`, artifact ID `15093427467`, 19,677 bytes. It is preserved for later extraction. Do not infer that all 40 cases completed: the workflow permits timeouts, and the artifact's completed/timeout split has not yet been inspected. It does assert 40 total rows, zero errors, and that all completed rows matched; timed-out rows are not counted as matched.

Run 16 confirms the later privilege-state checks on one paired case. The 40-case run preceded those additional status assertions, although it used the same setpriv launcher flags and passed the earlier UID/environment/private-mode checks and the hosted isolation probe.

## What this establishes

The hosted harness can launch the two Node arms under a non-privileged server UID and the learner under a distinct non-privileged UID, scrub inherited runner variables, keep the private SCO module under restrictive filesystem permissions, and run the hW learner through the HTTP interface. The learner seed no longer encodes target identity.

The 40-case run is evidence that the corrected harness and paired workflow execute across the requested state/seed grid without workflow-level errors. Exact cloneability, request counts, timeout rate, and paired parity aggregates remain pending artifact extraction; no numeric security conclusion is claimed here.

## Residual limitations

1. This is host-level UID separation on a shared GitHub runner, not a separate VM/container or network namespace. No egress firewall was applied; the learner shares the runner network namespace and can reach the intended local HTTP endpoint.
2. The isolation probe verifies server `/proc` environment/memory/FD denial, private-file denial, parent `/proc` environment denial, and sudo blocking. It does not yet verify learner denial of the trusted parent's `/proc/<pid>/mem` or `/proc/<pid>/fd`; this was requested from Agent 49 for follow-up.
3. The server process's actual capability/no-new-privileges state is checked in run 16, but the 40-case run 15 predates those explicit status assertions.
4. The target fixture and seed remain in trusted parent memory. The current boundary relies on cross-UID process protections and the probe; it is not a kernel-compromise-resistant boundary.
5. The learner can make repeated legitimate HTTP requests. This matches the stated SCO attacker model, but the current benchmark exercises only the hW learner's configured walk, not unlimited adaptive query strategies.

## Integration state and next work

The candidate branch was cut from PR #378's head, not rebased on current `main`. PR #378 has not been updated or merged. Agent 49 has a parallel integration PR #380 with overlapping isolation work. Consolidate the stronger implementation rather than maintaining duplicate branches; compare cleanup behavior, actual process-status checks, private file modes, and the 40-case artifact before promotion.

Next:
1. Extract run 15's artifact and record completed, timeout, and matched-pair counts plus per-state results.
2. Add parent `/proc` memory/FD checks to the isolation probe and rerun it.
3. Have Agent 49 review the current candidate's launcher, cleanup, and remaining boundary assumptions.
4. Consolidate with PR #380/PR #378, rebase onto current `main`, then rerun the 40-case benchmark and focused tests.
