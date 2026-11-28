# Agent 10 — review of Agent 11's live three-state SCO policy branch

**Reviewed branch:** `agent11/sco-three-state-live-policy-attack-20261128`  
**Exact head:** `1d6a7106de345e896124e566a635a4bbf0799adb`  
**Disposition:** useful experimental direction, but **not executable or acceptance-ready**. No run was found for this branch's equal-trust workflow.

## Confirmed implementation defects

1. `sims/sco-three-state-policy-attacker.js:41` contains the literal two-character sequence `\n` between the `body` property and `signal` option:
   ```js
   body:JSON.stringify({method,args:[input]}),\n      signal:AbortSignal.timeout(5000)
   ```
   This is not a line break inside JavaScript source; it is a backslash outside a string and makes the file fail parsing. The attacker child process cannot start.

2. `test/sco-three-state-live-policy.test.js:359` and `:367` pass `classes` to `verifyAttack`, but no `classes` variable is declared. The computed value is `result.classes` at line 328.

3. `test/sco-three-state-live-policy.test.js:394` and `:409` call `simulatePolicy(policyNodes, ...)`, but `policyNodes` is never declared. The test already constructs `policy` at line 335; the intended value appears to be `policy.nodes`.

These are deterministic source defects, not speculative CI concerns. The test cannot complete even after the first syntax error is corrected.

## Evidence-contract gaps after those fixes

- The test does construct a generated SCO HTTP facade and a separate ordinary JSON-RPC control around the same three-state machine. This is a useful live transport falsifier.
- The ordinary control is hand-written JSON-RPC, not an ordinary-minified private API. It does not yet satisfy the frozen plan's equal-trust minified-control comparison.
- Live integration samples only five model indices (`0, 1, 12345, 23456, 46655`) across two transports. That is a smoke test of the policy implementation, not exhaustive live replay; keep the exhaustive finite-model claim separate.
- The attacker returns `inputs` and `outputs`, but the test discards them when constructing `receipts`. Receipts retain only model, transport, query count, terminal class, and final state. They do not preserve the complete 24-call input/output transcript, source hashes, policy hash, or HTTP response transcript.
- No post-shutdown held-out behavior receipt is retained. The test verifies the hidden state/class while the parent still has the oracle model; it does not show a persistent extracted clone after server shutdown.
- The branch's `manual-sco-batch-equal-trust.yml` remains the pre-existing one-trace/32-replay workflow; it does not invoke `test/sco-three-state-live-policy.test.js` or upload a live-policy receipt. No workflow run for that workflow on this branch was found.

## Recommended next steps

1. Fix the literal `\n` source corruption.
2. Pass `result.classes` and `policy.nodes` to the two test helpers.
3. Add a strict JSDoc check and a dedicated manual workflow that runs the process-separated test on the exact branch SHA.
4. Preserve the full inputs/outputs, response status/value sequence, policy/source hashes, and terminal class in an uploaded artifact.
5. Add a genuinely ordinary-minified private API control with the same hidden behavior and authorization boundary.
6. Treat the five-model live replay as a smoke test only; retain the exhaustive 46,656-table computation as a separate finite-model result.
7. Do not mark the acceptance plan's live 24-call requirement complete until the corrected process-separated workflow passes and the artifact is independently reviewed.

This is an early falsifier, not a general SCO security claim. It can demonstrate that the finite policy works against a particular generated facade; it cannot establish arbitrary-service cloning or a measured incremental advantage over a minified control.


## Additional deterministic blocker: ordinary control cannot pass attacker preflight

The test's process-separated attacker always performs a GET of `/obfs/client.mjs` before issuing its 24 RPC calls (`sims/sco-three-state-policy-attacker.js`). The generated SCO fixture serves that route in `startSco` (`test/sco-three-state-live-policy.test.js:123`). The ordinary control's server handler (`startOrdinary`, lines 139–142) accepts only POST `/obfs/rpc` and returns 404 for every other request. Therefore, after fixing the attacker's parse error, the ordinary-control replay still fails at the initial public-client fetch. Serve an equivalent ordinary-minified `client.mjs` from that control, with the same visible method/endpoint and the same authorization boundary.

The branch therefore has at least four independent execution blockers before it can produce a two-arm live receipt: the literal `\\n` parse error, the missing `classes` binding, the missing `policyNodes` binding, and the ordinary control's missing GET client route.
