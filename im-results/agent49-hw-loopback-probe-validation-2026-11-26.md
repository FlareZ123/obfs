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


## Follow-up: exact SSH banner regression and live version-space audit

The next branch revision added a stronger regression test that accepts a TCP connection and sends an actual OpenSSH-style `SSH-2.0-...` banner with CRLF. This exercises the exact `http.client.BadStatusLine` path from run 45792963990, rather than merely testing a silent/non-responsive socket.

The live matched-control output now preserves `fixture_table`, `observed_trace`, `target_post_trace_state`, and `trace_matching_initial_candidates` in the trusted parent's post-run artifact. These fields are produced only after the learner exits and are not passed to learner argv, environment, or HTTP API. The workflow installs the existing pinned Z3 solver, runs its unit tests, audits prioritized live traces, and preserves the audit JSON alongside the matched-control artifact.

Exact-head run [45815794381](https://github.com/FlareZ123/obfs/actions/runs/45815794381) passed all steps on Ubuntu at source head `c4c430991f9b0a4974063c7103dce097163a3ea7`:
- 8/8 live pairs completed, zero timeouts/errors;
- 8/8 future-behavior clones in both arms;
- 6/8 exact initial clones in both arms; the other two each had two returned-hypothesis initial candidates but one future-behavior class;
- 7,022 SUL steps and 7,062 HTTP requests per arm;
- all process-isolation, IPv4/IPv6 listener, actual SSH-banner, sequential single-arm, and evaluator tests passed.

The bounded full-version-space audit selected the two ambiguous four-state cases. With Z3 5.4.1.0 and a 10,000 ms timeout per candidate size, both audits returned `UNKNOWN`: candidate sizes 1, 2, and 3 were UNSAT, while the four-state candidate search timed out. The traces had 3,781 and 2,204 state-separation constraints respectively. Thus the audit excludes smaller machines for these cases but cannot establish whether a distinct four-state future-behavior candidate exists. There were zero SAT witnesses and zero final UNSAT results; do not describe this as version-space uniqueness.

Artifact: `agent2-live-hw-matched-control`, ID `15114732787`, ZIP SHA-256 `3f7fcb296a2657e9a2b13b1924358e3d3490ae18826ab70c2b5feb5e39c363e0`.

The 16–24-state / 36-target experiment with the same live version-space audit is queued separately as run 45815986225 at the later parameterized-workflow head. Its outcome is not included in this report until completed.


## Follow-up: broaden the scan beyond loopback (validated)

A subsequent code review found that the earlier probe still ignored listeners bound exclusively to a specific non-loopback interface address. The learner shares the host network namespace and can inspect `/proc/net/tcp*`, so such a local service could be reachable even though it is not bound to loopback or a wildcard. The earlier successful isolation receipts are therefore scoped to loopback and wildcard listeners only.

The current Agent49 branch revision changes the scanner to enumerate all connectable local IPv4/IPv6 TCP LISTEN addresses from `/proc/net/tcp` and `/proc/net/tcp6`:
- wildcard binds map to 127.0.0.1 / ::1;
- loopback binds remain included;
- specific local interface addresses are now included;
- IPv6 link-local addresses are skipped because `/proc/net/tcp6` does not expose the interface scope ID needed to construct a valid connect address.

New tests use a UDP route-selection socket (no application packet is sent) to discover a local source address, bind a TCP listener to that specific address, and assert that the scanner enumerates it. IPv6-specific-address coverage is conditional on the runner having a usable non-loopback IPv6 route. The existing real SSH-banner regression remains in place.

Exact-head hosted validation [45816638063](https://github.com/FlareZ123/obfs/actions/runs/45816638063) passed on head `abddbf5bd055f04390afab85c2ac3beb41128e70`. The specific non-loopback IPv4 bind-address test passed; the non-loopback IPv6 test was skipped because the runner had no non-loopback IPv6 route. The real SSH-banner regression, IPv4/IPv6 loopback/wildcard tests, process-isolation checks, sequential single-arm probe, matched-control benchmark, and bounded version-space audit all passed. Its eight 2–5-state pairs produced 8/8 future-behavior clones, 6/8 exact initial clones, zero errors/timeouts, 6,019 SUL steps and 6,059 HTTP requests per arm. Two ambiguous three-state cases were UNSAT for candidate sizes 1–3 (no SAT/UNKNOWN).

A subsequent exact-head run [45817116198](https://github.com/FlareZ123/obfs/actions/runs/45817116198) passed on head `1f82e8dbb80ddb60bc1875f42a16bf6a3d727cb8`, including the new two-state Z3 regression. Its eight 2–5-state pairs produced 8/8 future-behavior clones, 7/8 exact initial clones, zero errors/timeouts, 5,931 SUL steps and 5,971 HTTP requests per arm. One ambiguous three-state trace was UNSAT for candidate sizes 1–3. An immediately preceding run [45816939901](https://github.com/FlareZ123/obfs/actions/runs/45816939901) failed only because the new unit test looked for `candidate_size_search` under the witness rather than the audit result; the assertion was corrected and run 45817116198 passed.

Even after this TCP scan passes, the probe does not establish absence of UDP or Unix-domain-socket oracles. The 36-target 16–24-state experiment with four 20-second-per-size version-space audits remains in progress as run [45815986225](https://github.com/FlareZ123/obfs/actions/runs/45815986225), on the earlier loopback-only scanner revision. Do not include its results until the run completes and its logs/artifact are inspected.
