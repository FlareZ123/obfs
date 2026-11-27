# Five-state live RPC control failure — diagnostic checkpoint, 2026-11-27

Classification: intermediate harness diagnosis, NOT acceptance or a security result.

## Exact evidence
- Prior shared candidate: `6bafb399412e6503ef6139a48a8cbd96e05dfa73` on `agent1/weakmap-exported-container-review-20261126`.
- Full run [45913984591](https://github.com/FlareZ123/obfs/actions/runs/45913984591): Linux 5,684 passed, 1 failed, 25 skipped; Windows full green. Prior focused WeakMap 37/37 on three OS and complete Chromium green do not replace the full gate.
- Focused [45914692360](https://github.com/FlareZ123/obfs/actions/runs/45914692360) on Node 22.23.4 reproduced the five-state ordinary-control failure on Ubuntu (9.20 s test) and macOS (12.81 s test); Windows passed. The actual stack is ordinary/client.mjs -> learnFiveStateStepOnly line 246 -> runLiveStepVersionSpace line 218, with undici read ECONNRESET. This is during the ordinary learner, not proof of a compiler regression.
- `sims/sco-step-only-live-rpc.js` baseline blob `9392bf46e2656e4ab9a6ea53613fff3bbee1f5c5`. Both HTTP servers are created in the same process as synchronous learner scans; ordinary denied POST runs before generated learning, so a reused ordinary connection can be idle while the generated learner works. The five-state candidate workspace is reused and reset before each arm. This makes stale keep-alive reuse plausible, not established.
- Node 22 HTTP documents default 5 s keepAliveTimeout and a 1 s socket timeout buffer added in v22.19.0: https://nodejs.org/download/release/latest-jod/docs/api/http.html#serverkeepalivetimeoutbuffer . Historical related undici issue: https://github.com/nodejs/undici/issues/3141 . These establish general transport mechanisms, not this failure's cause.

## Local native-only controls
Linux local runtime Node 22.16.0, undici 6.21.2 (different from CI). Two local stateful HTTP servers and sequential 1.2/2.6/1.7/0.9 s CPU stalls in arm A followed by 1.8/2.4 s CPU stalls in arm B passed both default 5 s and 60 s server keep-alive configurations. No naturally occurring reset reproduced in this small test. The ordinary idle socket closed around 5.65 s at default timeout and was replaced successfully before the first ordinary authorized request around 8.37 s. With 60 s timeout the original ordinary connection was reused successfully. This does not compare actual five-state learner behavior.

Separate forced idle-close diagnostic, runnable with stock Node and no dependencies: `node im-results/agent10-http-idle-close-repro-2026-11-27.cjs`. Ten local alternating trials: five immediate POSTs after explicit server.closeIdleConnections all failed with UND_ERR_SOCKET; five with a setImmediate turn all returned 200. The forced-close error is not the original ECONNRESET. It demonstrates that stale socket selection is possible in this runtime, not that default expiry caused the CI failure. The yield is a controlled contrast, not a proposed production retry or universal fix.

## Exact-source diagnostic underway
Dedicated diagnostic branch `agent10/step-live-keepalive-diagnosis-20261127`, source `63e4b9c19d94a7804caa3742a7235a64a7b08c33`: adds monotonic phase markers, server connection/timeout/close/request/response events and undici sendHeaders/request:error events for the five-state fixture only. No retries, no assertion changes, no compiler changes, no new workflows. [Focused run 45919685576](https://github.com/FlareZ123/obfs/actions/runs/45919685576) was queued/in progress at this checkpoint; check exact head and logs. Do not infer root cause or green acceptance before those results.

Next: correlate failed client send socket localPort with the matching server remotePort, close/timeout events, and missing or completed request. If the trace supports idle expiry, compare a symmetric bounded test-only keepAliveTimeout (e.g. 60 s) in both arms, preserving exact state transitions, unauthorized 403, transcript/query count and strict test time checks. Do not auto-retry POST: the transition may already have executed without its response reaching the client. If the trace does not reproduce, retain that uncertainty and use an exact-head repeat or a narrowed controlled timing experiment. Do not change the shared WeakMap source or claim full gate acceptance. RELEASE-BLOCKED.


## 02:45 UTC continuation — transport trace and symmetric harness control

Diagnostic [run 45919685576](https://github.com/FlareZ123/obfs/actions/runs/45919685576) completed on the exact trace-only head `63e4b9c19d94a7804caa3742a7235a64a7b08c33`: Ubuntu/macOS passed; Windows failed the five-state ordinary control, 4/5 focused tests passed. The failure changed platforms relative to 45914692360. This does not establish a Unix-only defect.

Windows failed-job trace, job 140247186780 (times are monotonic ms; local client port matches server remote port):

| ms | event | port |
|---:|---|---:|
| 48386 | ordinary client send /step on newly connected socket | 62510 |
| 48387 | ordinary server request | 62510 |
| 48387 | ordinary HTTP 200 response | 62510 |
| 53654–53656 | different ordinary socket sends and receives HTTP 200 | 62521 |
| 56578 | ordinary client sends /step on reused socket | 62510 |
| 56579 | ordinary server socket timeout | 62510 |
| 56580 | ordinary client ECONNRESET | 62510 |
| 56582 | ordinary server socket close, hadError=false | 62510 |

No server request event for the failed send was present in the retrieved trace. The elapsed interval between the earlier response and the failed reuse was 8,191 ms. The same socket timed out one millisecond after the client send; this is direct evidence of a keep-alive expiry/reuse race in this run, not proof that all earlier failures have this cause. Ordinary learner synchronous work spans multi-second inter-request gaps. The generated arm had already completed its 31 queries. Do not infer the effect of the failure on unobserved requests or generally retry a stateful POST.

Isolated diagnostic branch `agent10/step-live-keepalive-diagnosis-20261127`, candidate commit [37b6af1](https://github.com/FlareZ123/obfs/commit/37b6af110ded207a061cd37c335fa968b6766ca2): set identical 60,000 ms HTTP keepAliveTimeout options on both in-process loopback servers; retain all trace instrumentation, test assertions, query counts, 403 checks and timing limits. No compiler/runtime changes or production timeout defaults. The longer timeout is a bounded test-harness control to distinguish this mechanism, not a new release claim. It may still fail if a pause exceeds the window or for a different transport cause. The existing manual-validation focused matrix was dispatched at [45930249836](https://github.com/FlareZ123/obfs/actions/runs/45930249836), exact head confirmed, queued when recorded. A green focused run would be supporting evidence only. Do not merge into main or weaken test assertions without review and broader validation.
