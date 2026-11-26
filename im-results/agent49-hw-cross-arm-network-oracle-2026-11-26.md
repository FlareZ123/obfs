# Agent 49: reproduced cross-arm localhost oracle exposure in the hW matched-control harness

**Date:** 2026-11-26  
**Reviewed base:** `agent2/hw-live-isolated-20261126` at `274a1cb8d252397edd2a799941514e9468c65856`  
**Probe branch:** `agent49/hw-cross-arm-probe-20261126`  
**Probe source:** `484e2bdf095b19b570768da07f6938210be473ec`  
**Run:** [45776593993](https://github.com/FlareZ123/obfs/actions/runs/45776593993)  
**Artifact ID:** `15096606502`  
**Artifact SHA-256:** `3c8d4ee0ab4343481f041a3fd2bfd207e0789012ba118ec6a260c1a5b2add8ab`

## Finding

The two live matched-control services are **not isolated from one another at the network layer**. A learner process running as `nobody` can discover the ordinary-control listener while attacking the SCO listener, obtain the ordinary service's own public session cookie, and successfully call its RPC method.

This was reproduced against the actual branch launchers and both actual service implementations—not merely against dummy TCP listeners.

## Red-first hosted reproduction

The probe:
1. Started the generated SCO server and ordinary minified HTTP control concurrently, both bound to `127.0.0.1` on ephemeral ports in the same network namespace.
2. Started a separate learner process as UID/EUID 65534 (`nobody`) with only the SCO origin in argv. It received no ordinary origin, target seed, target state count, session token, or fixture data.
3. Read the world-readable `/proc/net/tcp` table and discovered both loopback LISTEN ports.
4. Excluded the supplied SCO port, then sent `GET /obfs/client.mjs` to the second port.
5. Obtained the ordinary server's public session cookie and method identifier, then sent an authenticated `POST /obfs/rpc` with `args:[0]`.
6. Received HTTP 200 and the expected initial-state output.

The preserved run-22 artifact records:

| Field | Observed value |
|---|---|
| Learner UID / EUID | 65534 / 65534 |
| `NoNewPrivs` | 1 |
| `CapEff` / `CapBnd` | all zero |
| `sudo -n` | blocked |
| Candidate SCO port | 38579 |
| Discovered alternate port | 37227 |
| Visible loopback listeners | 37227, 38579 |
| Candidate / alternate cookie SHA-256 | identical: `6d93ffbfd9f070aad13358d294f975a0fe7c4d6e166b79c47a68b72f5b69b8ab` |
| Candidate / alternate method name | identical |
| Candidate module SHA-256 | `2c15110313ff46e2777133bbfdd044e50f945ce4222e1669ddb17b4b8c8f1a5f` |
| Alternate module | 337 bytes; SHA-256 `531351162efbccf25f0dca89e08c62890488578d613539777d0306b915d7ff48` |
| Alternate authorized RPC | HTTP 200 |
| Returned value | `"0"`, matching the evaluator's expected initial output |

The learner's environment was exactly the existing allowlist: `HOME`, `LANG`, `LD_LIBRARY_PATH`, `PATH`, `PYTHONDONTWRITEBYTECODE`, `PYTHONHASHSEED`, `PYTHONNOUSERSITE`, and `TMPDIR`. No target/fixture/oracle or GitHub/runner environment variables were present. The ordinary server accepted the call despite the learner having no ordinary endpoint or cookie supplied out of band.

The workflow step is intentionally named **“Probe cross-arm localhost oracle exposure (expected reproduction)”**. Its green conclusion means the expected cross-arm exposure was reproduced; it is not a security pass.

## Why the existing host isolation did not prevent it

The hardened launcher correctly separates parent, server, and learner UIDs, clears supplementary groups and capabilities, applies `NoNewPrivs`, scrubs the child environment, and protects the SCO private file/root with `0600/0700` modes. Those controls protect the tested filesystem and process-inspection boundaries.

They do not create separate network namespaces. Both services are listening in the same loopback namespace, and the learner can enumerate those sockets. The two arms also share the same session token and method identifier. More importantly, each public module endpoint issues its own cookie to any caller, so **different per-arm cookies alone would not close this path**: the learner can fetch the alternate module and obtain its cookie after discovering the port.

## Consequence and scope

- This is a **benchmark harness isolation flaw**, not a demonstrated defect in the production SCO handler or obfuscator.
- The fixed AALpy hW client used in runs 18 and 19 only calls the single origin passed to it. The earlier 30/30 matched-pair observations therefore remain valid for that exact client and fixture set.
- The experiment cannot claim that a client-controlled, agentic, or instrumented attacker is isolated to one arm. Such an attacker can use the ordinary control as an alternate oracle, and its requests are outside the intended per-arm accounting.
- The finding does not establish any additional confidentiality or tamper resistance.

## Required correction

Preferred correction: **run the two arms sequentially**. Start the SCO server, run the learner, stop the SCO server, then start the ordinary control and run the same learner RNG seed against it. Recreate the identical fixture from evaluator-only state, but use independent per-arm session tokens. Never leave the other arm listening while the learner runs.

A separate network namespace/container with an enforced one-endpoint route is also acceptable. Merely changing cookies, hiding the alternate port from argv, or keeping the current UID separation is insufficient.

## Proposed correction validated separately

A sequential-arm correction has since been implemented on `agent49/hw-cross-arm-probe-20261126` and proposed for owner review in [draft PR #381](https://github.com/FlareZ123/obfs/pull/381), targeting `agent2/hw-live-isolated-20261126`. The revised harness starts one service, runs the learner, stops it, and only then starts the other service with an independent session token.

The sequential single-arm probes found no alternate service in either arm. The revised benchmark passed 15 delayed-pair cases and 15 random cases (plus a one-pair smoke test): 31/31 matched pairs, exact initial and future clones in both arms, and zero errors/timeouts. Detailed metrics and artifact hashes are in `im-results/agent49-hw-sequential-arm-isolation-2026-11-26.md`. This validates the harness correction on the tested runner; it does not change the scope of the original concurrent-design finding above.

## Reproduction files

- `sims/agent49-hw-cross-arm-network-probe.py` — untrusted learner-side port enumeration and alternate RPC.
- `sims/agent49-hw-cross-arm-network-probe-runner.py` — starts the actual SCO and ordinary services and launches the probe as `nobody`.
- `.github/workflows/manual-agent2-hw-live-matched-control.yml` on `agent49/hw-cross-arm-probe-20261126` — invokes the red-first probe and preserves its JSON evidence in the run artifact.

This remains intermediate harness evidence in `im-results/`. Agent 2 has been notified with the exact reproduction and suggested correction. Do not merge the probe branch as a production change; port the sequential/network-isolated harness correction into the single hW integration branch after owner review.
