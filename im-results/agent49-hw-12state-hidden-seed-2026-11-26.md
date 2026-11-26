# Agent 49: hW reconstruction of a 12-state random machine under isolated SCO

**Date:** 2026-11-26  
**Source branch:** `agent49/hw-cross-arm-probe-20261126`  
**Source commit:** `8b0db72f22c636ce73ecd6d49a1af5bcf774908d`  
**Workflow run:** [45781473770](https://github.com/FlareZ123/obfs/actions/runs/45781473770)  
**Artifact ID:** `15098612569`  
**Artifact SHA-256:** `92767aae66c168fea87f41a7f60baf7aa591617a557cfd8a975caaad7db550d7`

## Configuration

- One random 12-state Mealy fixture.
- Target seed: `4899275234192369848`, generated with `secrets.randbits(64)`.
- Learner RNG seed: 41342, independent of target seed and state count.
- Target seed and state count were not passed in learner argv or environment.
- SCO partition seed and private canary were independently generated; no target-seed argument is accepted by the SCO launcher.
- SCO and ordinary arms ran sequentially, with independent session tokens.
- Learner UID/EUID 65534; server UID 33; NoNewPrivs=1; zero effective/bounding capabilities; sudo blocked; scrubbed learner environment.

## Results

- 1/1 matched pair.
- Exact initial-state clone: **success** in both arms.
- Future-behavior clone: **success** in both arms.
- 12-state complete hypothesis; one trace-matching candidate and one end-behavior equivalence class.
- No initial or future ambiguity; no false convergence.
- Zero errors and zero timeouts.
- 1,122 SUL steps and 1,127 HTTP requests per arm.
- Workflow-reported elapsed time: 2.0825 seconds.
- Learner elapsed time: 0.4981 seconds per arm.
- RPC traces, hypotheses, evaluation outcomes, and request counts matched across SCO and ordinary control; public module bodies differed as expected.
- Sequential single-arm probes passed, no alternate service was visible, and session tokens were distinct.

## Per-request latency

| Metric | SCO | Ordinary control |
|---|---:|---:|
| Mean | 0.4038 ms | 0.3373 ms |
| p50 | 0.3921 ms | 0.3023 ms |
| p95 | 0.5196 ms | 0.4430 ms |
| Maximum | 1.3754 ms | 1.4828 ms |

This is a local Python-client-to-Node-server API measurement, not a comparison with original local JavaScript execution and not a full 2.5x budget result.

## Interpretation

The fixed hW learner reconstructed exact initial and future behavior for one 12-state random machine without knowing its 64-bit target seed. This extends the earlier 2–4-state sample, but is only one 12-state trial; more seeds and larger state counts are needed before making a scaling claim.

The result is still limited to a finite-state API, local HTTP, and the tested learner. It does not establish arbitrary JavaScript reconstruction, browser/WAN behavior, TLS behavior, or resistance to all dynamic analysis. Keep it in `im-results/` as intermediate evidence.
