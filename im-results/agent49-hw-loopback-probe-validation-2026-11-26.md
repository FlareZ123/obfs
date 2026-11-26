# Agent 49: IPv4/IPv6 loopback probe regression and live hW smoke validation

**Date:** 2026-11-26  
**Status:** Intermediate validation evidence; not an established security result.  
**Branch/source:** `agent49/hw-state-scaling-20261126` at `62e42e582e6283c093b060f4574ef7e77b864529`  
**Workflow:** [45814904929](https://github.com/FlareZ123/obfs/actions/runs/45814904929) — success  
**Artifact:** `agent2-live-hw-matched-control`, ID `15115590606`, ZIP SHA-256 `9c3a55ef2846424848a94950633a698768a2ac05fb5c69e79d16406b3ea596e5`

## Failure and correction

The preceding exact-head workflow [45792963990](https://github.com/FlareZ123/obfs/actions/runs/45792963990) failed in the sequential single-arm listener scan. It encountered the runner's unrelated SSH listener and raised `http.client.BadStatusLine: SSH-2.0-OpenSSH_10.2p1 Ubuntu-2ubuntu3.8` instead of treating that endpoint as a non-SCO TCP service.

The probe now catches `http.client.HTTPException` (including `BadStatusLine`) alongside socket and value errors, and returns no SCO module for unrelated services. A regression test binds a non-HTTP TCP listener and asserts that the scan ignores it.

The expanded listener decoder enumerates:
- IPv4 loopback addresses in 127/8;
- IPv4 wildcard listeners, probed through 127.0.0.1;
- IPv6 loopback listeners;
- IPv6 wildcard listeners, probed through ::1;
- IPv4-mapped IPv6 loopback/wildcard addresses.

The unit suite exercises 127.0.0.1, 127.0.0.2, 0.0.0.0, ::1, ::, and a non-HTTP listener. IPv6 checks skip only when IPv6 binding is unavailable.

## Exact validation

Run 45814904929 used:
- workflow `manual-agent2-hw-live-matched-control.yml`;
- fixture family `random`, 2–5 states, two targets per state count (eight pairs);
- 64-bit OS-random target seeds;
- learner seed 41342, AALpy 2.0.0, random-walk length 30, 20 origin states;
- 120-second per-arm learner timeout.

Every workflow step passed on Ubuntu:
1. dependency installation and syntax checks;
2. cross-UID process-isolation probe;
3. IPv4/IPv6 listener discovery tests, including the non-HTTP regression;
4. sequential single-arm SCO/ordinary isolation probe;
5. evaluator semantics tests;
6. paired live HTTP benchmark and artifact publication.

The process-isolation evidence reported server UID 33 and learner UID/EUID 65534, with `NoNewPrivs=1`, empty effective/bounding capability sets, blocked sudo, and the expected scrubbed learner environment. The sequential probe verified that only the currently active arm exposed a matching public module and that the two arm session tokens were distinct.

Live matched-control results:
- 8/8 pairs completed; zero timeouts and zero errors.
- 8/8 matched pairs.
- 8/8 future-behavior clones in SCO and 8/8 in ordinary HTTP.
- 7/8 exact initial-state clones in each arm; one case had two trace-consistent initial candidates but one future-behavior class.
- Zero false initial or future convergence in the returned hW hypothesis.
- 5,949 SUL steps and 5,989 HTTP requests per arm.
- Learner traces, hypotheses, RPC request/response traces, public metadata, server request counts, and evaluator outcomes matched across the two arms.

## Interpretation and limitations

This is a smoke/compatibility receipt for the listener-probe correction and the existing sequential matched-control harness. It is not a security theorem, a general SCO result, or evidence about arbitrary JavaScript. The eight small-state targets do not add a meaningful state-scaling sample.

The 36-target 16–24-state replication remains pinned to earlier source `a385fccda3b495a099ee91ca51691fff2a1b3c70` and run 45792350960. The only changes between that source and the current 62e42 probe revision are the non-HTTP listener handling and its regression tests; the target generator, hW learner, SCO path, ordinary control, and evaluator were unchanged. The new eight-pair run checks the current integrated harness but is not a rerun of the 36-target sample.

The evaluator still checks the trace-consistent candidates in the learner's returned hW hypothesis. That does not establish uniqueness in the complete finite-state version space. Agent 2's separate bounded Z3 audit found 1 SAT and 9 UNKNOWN among ten prioritized offline traces; those outcomes are not results for these live targets. No 2.5× original-JavaScript compute comparison was performed.

A follow-up experiment adds evaluator-only target fixtures and public traces to the post-run artifact and applies the existing bounded version-space solver to selected live cases. It is being validated separately; do not treat it as complete until its exact-head workflow succeeds.
