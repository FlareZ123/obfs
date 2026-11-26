# Agent 49: sequential matched-control correction and validation

**Date:** 2026-11-26  
**Correction branch:** `agent49/hw-cross-arm-probe-20261126`  
**Correction source:** `a371c7f6a56133fc35affc33878212e2a9d4239b`  
**Draft integration PR:** [#381](https://github.com/FlareZ123/obfs/pull/381), targeting `agent2/hw-live-isolated-20261126`  
**Original flaw reproduction:** [run 45776593993](https://github.com/FlareZ123/obfs/actions/runs/45776593993), detailed in `im-results/agent49-hw-cross-arm-network-oracle-2026-11-26.md`.

## Correction

The proposed harness correction runs the two matched arms **sequentially**:
1. Start SCO, preflight it, run the learner, and stop the SCO server.
2. Only then start the ordinary control with a fresh session token and canary.
3. Run the same learner RNG seed against the same deterministic fixture, then stop the ordinary server.

The two arms no longer share an authentication capability. Public module metadata comparison ignores only the per-arm cookie value hash; RPC trace comparison normalizes only the cookie hash while retaining each arm's full RPC trace hash. The invalid-argument probe comparison similarly ignores only the cookie hash. The benchmark explicitly requires `session_tokens_distinct=true`.

A separate learner-side probe runs while each arm is alone. It enumerates loopback listeners visible through `/proc/net/tcp`, verifies that the active endpoint is present, and fails if any alternate listener also exposes `GET /obfs/client.mjs` with a method identifier and session cookie.

The original concurrent cross-arm exploit probe remains in the branch as a red-first reproduction witness; it is no longer the workflow's isolation step.

## Hosted validation

| Run | Fixture | Cases | Matched pairs | Exact initial / future clones per arm | SUL steps per arm | HTTP requests per arm | Errors / timeouts | Elapsed |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| [23](https://github.com/FlareZ123/obfs/actions/runs/45777253164) | Random, 2 states | 1 | 1/1 | 1/1; 1/1 | 644 | 649 | 0 / 0 | 1.2961 s |
| [24](https://github.com/FlareZ123/obfs/actions/runs/45777374353) | Delayed-pair, 3–5 states, seeds 0–4 | 15 | 15/15 | 15/15; 15/15 | 11,933 | 12,008 | 0 / 0 | 15.9422 s |
| [25](https://github.com/FlareZ123/obfs/actions/runs/45777510781) | Random, 2–4 states, seeds 0–4 | 15 | 15/15 | 15/15; 15/15 | 11,242 | 11,317 | 0 / 0 | 19.7546 s |

Across all three runs: **31/31 matched pairs**, 31/31 exact initial clones and 31/31 future clones in each arm, zero errors/timeouts, 23,819 SUL steps and 23,974 HTTP requests per arm. The sum of the three workflow-reported elapsed durations is 36.9929 seconds.

The two 15-case suites alone account for 30/30 matched pairs, 23,175 SUL steps and 23,325 HTTP requests per arm. These are the same per-arm SUL-step and HTTP-request totals as the earlier concurrent run 18 (random family) and run 19 (delayed-pair family). Thus the correction changes arm scheduling and authentication isolation without changing the tested learner behavior or request accounting.

### Single-arm isolation receipts

All three runs include `agent49-cross-arm-probe-result.json`. In every run:
- The sequential isolation runner completed with `status=sequential_single_arm_isolation_confirmed`.
- The SCO-only and ordinary-only probes each returned `status=single_arm_isolated`.
- Both probes found `alternate_services=[]`; each active service was the only matching listener visible to the learner.
- Session tokens were distinct between arms.
- The learner ran as UID/EUID 65534 with `NoNewPrivs=1`, `CapEff=0`, `CapBnd=0`, and `sudo -n` blocked.
- The learner environment matched the allowlist; the SCO private root/file remained `0700/0600`.

Run 23's artifact specifically records one visible loopback listener for the SCO-only probe (port 34103) and one for the ordinary-only probe (port 38411), with no alternate service in either case. The two module cookie hashes differ.

### Artifact receipts

| Run | Artifact ID | Artifact SHA-256 |
|---|---:|---|
| 23 | `15095839208` | `56af5eff380e5b6d36948f96a807e9b97d857562992791b741258575a4794894` |
| 24 | `15095804109` | `24a451ac3cbf90e3273e8773daa2fb1186009f2b5828014528b0046e0f097ce8` |
| 25 | `15096338467` | `fb11704cc04099ec47b1e7fa98a418f3a4167c268afaaf44ceb0b67fb143d8a0` |

## Interpretation

The earlier red-first run demonstrated that the concurrent design let a hostile learner reach the ordinary control. The sequential probe now verifies that this alternate local oracle is absent during either arm, while the matched hW experiments still produce identical traces, hypotheses, evaluator results, and request counts.

This is a validated correction to the **benchmark harness**, not a production SCO security claim. The evidence is bounded to the tested Linux hosted runner, deterministic Mealy fixture families, and exact hW learner. It does not establish browser/WAN behavior, timing equivalence, or resistance to arbitrary kernel/container attacks.

The draft PR #381 is intentionally based on Agent 2's isolated hW branch for owner review. Do not merge the probe branch directly to `main`; integrate the correction into the hW implementation after review.
