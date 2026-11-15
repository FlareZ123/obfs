# SCO state-dependent batch authorization: reproducible snapshot mismatch and modeled preflight

Date: 2026-11-15. Agent 9. Status: intermediate security engineering evidence, not an academic obfuscation result.

## Question and threat boundary

Can a request-level authorization check applied to every member of a bounded SCO RPC batch enforce a policy whose permissions change *during* that same batch?

The experiment assumes an authorized caller can send arbitrary legitimate batch requests to a trusted SCO server. It does not assume a compromised server, forged session identity, nested batch helpers, or unregistered operations. The tested policy requires an active session for both `revoke` and `read`, with `revoke` immediately invalidating later `read` calls. An alternative application contract could deliberately authorize an entire batch using a frozen permission snapshot; the demonstrated mismatch matters when sequential operation-time authorization is the intended contract.

## Native HTTP reproduction

`test/sco-batch-state-drift.test.js` runs an actual ephemeral Node HTTP listener through `createScoHandler` and `createScoBatchMethod`. Its `authorizeOperation` callback records every outer and inner authorization decision. The protected `read` returns a harmless test sentinel, `private-value`, and effects are recorded separately.

1. With the original snapshot authorizer and active session, `batch([{method:'revoke',args:[]},{method:'read',args:[]}])` receives HTTP 200 with both operations marked successful. Recorded event order is `authorize:batch`, `authorize:revoke`, `authorize:read`, then `revoke`, `read`. The read occurs after session state becomes inactive.
2. With the same policy using separate HTTP calls, `revoke` receives HTTP 200 and the subsequent `read` receives HTTP 403. The protected read operation is never invoked.
3. With a pure modeled-transition check on the *outer* batch route, the sequence `revoke,read` receives HTTP 403 and commits no effects. The order `read,revoke` remains legal and executes both steps in that order.

The handler's inner-call authorization preflight is useful: a denied item at admission time blocks all earlier effects. Its timing is deliberately before execution, so it cannot reflect state changes made by earlier items. This is a temporal policy distinction rather than a bypass of the configured callback itself.

## Complete finite-state comparison

`test/sco-batch-state-model.test.js` enumerates all **510** nonempty sequences of length 1 through 8 over `{read,revoke}`, with an initially active session. The reference evaluator checks permission before each simulated operation. Only 16 sequences are valid: any number of reads, optionally followed by one final revocation.

| Evaluator | Accepted of 510 | Unsafe accepted relative to sequential policy |
| --- | ---: | ---: |
| Checks every operation against the initial active snapshot | 510 | 494 |
| Direct sequential transition evaluator | 16 | 0 |
| `preflightScoBatchState` over a complete pure model | 16 | 0 |

These counts are exhaustive **for this two-state machine**, not statistical evidence for general authorization systems.

## Mitigation and limitations

New opt-in `src/rpc-batch-policy.js` exports `preflightScoBatchState(calls,initialState,{authorize,transition})`. It validates batch-call shapes and the maximum 1024-item bound, then runs a synchronous authorization-and-state-transition model over the requested operation sequence without executing the operations. It declines an unauthorized later step before any real effects occur. Return types from `authorize` are checked to reject accidental asynchronous policy promises, rather than treating a Promise as a truthy authorization result.

This helper **cannot** infer the actual effects of methods. The integrator must supply a faithful, side-effect-free transition model and an authoritative snapshot that remains consistent through execution. Transactions, serialization or equivalent application controls are needed to prevent concurrent requests from invalidating the model. It does not implement rollback or mid-batch authorization. Restricting batch membership to permission-invariant operations is a simpler alternative.

The default SCO handler and batch semantics were intentionally left unchanged. Changing them to reauthorize after each operation would permit partially committed state-changing batches on a late denial, which requires an explicit application contract and potential rollback. For general-purpose code, a snapshot authorizer cannot prove all later permissions without application-specific state-transition knowledge.

## Verification, performance, and objective relevance

The focused [Linux/Windows SCO authorization workflow run #43703657326](https://github.com/FlareZ123/obfs/actions/runs/43703657326) passed on both operating systems at source SHA `e3d1e888d067ced362ffe8d51790a8f7f35f09df`. It ran both new test files with existing SCO operation, batch, partition and JSDoc suites. The preceding [run #43703222704](https://github.com/FlareZ123/obfs/actions/runs/43703222704) independently established the native HTTP snapshot mismatch before the model helper was added. Subsequent documentation-only commits do not have their own full-suite release gate.

The helper performs one model step per member, **O(batch length)** in the simple model. Its incremental time and whole-application end-to-end cost have not yet been measured, so no 2.5x performance claim is made. Its purpose is to clarify and strengthen one SCO trust-boundary integration option. It changes neither static reconstruction resistance nor the ability of an authorized attacker to query a server-resident function. The user-supplied full-control SNO and COO threat models remain unaffected.

Related background: [OWASP API Security Top 10, API1 Broken Object Level Authorization](https://api-security.owasp.org/editions/2023/en/0xa1-broken-object-level-authorization/), which emphasizes verifying access to each relevant resource. The specific temporal batch-preflight counterexample and model here are established by the repository's executable tests, not claimed as an OWASP finding.
