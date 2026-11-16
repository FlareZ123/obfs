# SCO isolated RPC: an expired callback must not start private work (2026-11-16)

**Status:** bounded trusted-server integration correctness and capability-lifetime repair. This is intermediate implementation evidence, not an obfuscation-security or hostile-runtime result.

## Threat and failure

An application can provide `runRpcIsolated(request,execute)` to bracket SCO authorization and private work under a server-owned account lock. The documented contract requires the integrator to await `execute()` exactly once. A faulty callback that retained `execute` and returned without invoking it caused the HTTP handler to reject the request with a generic 500. Previously, invoking the saved callback **after** that response still entered the protected task.

The real-HTTP regression in `test/sco-rpc-isolation.test.js` constructs exactly that callback, submits a JSON RPC, confirms HTTP 500, and invokes the retained function. Before the repair, the late invocation reached `respondJson` after running the private task and rejected with `ERR_HTTP_HEADERS_SENT`. This proves an execution-lifetime defect, not compromise of an honest isolation implementation.

**Pre-fix pinned red:** [manual SCO authorization run 43964837932](https://github.com/FlareZ123/obfs/actions/runs/43964837932) on exact SHA `20da2c354e34266800b06001f8329d612fd8ba30`. Ubuntu and Windows failed the new regression while the previous 152 targeted Node test cases otherwise produced 151 passes and one skip per runner. The failure log identifies the late `respondJson` stack after the private task.

## Repair and checks

`src/sco.js::handleRpc` now owns a short-lived `scopeOpen` flag for the callback supplied to `runRpcIsolated`. A call to that callback after the isolation wrapper has returned or thrown rejects immediately with a bounded internal `TypeError` before authorization or private method execution. The flag is cleared in `finally`, including the exception and capacity-denial paths. Existing one-call and duplicate-call checks remain in place. Server-originated errors are still converted to generic HTTP responses.

**Post-fix pinned green:** [manual SCO authorization run 43965076766](https://github.com/FlareZ123/obfs/actions/runs/43965076766) on exact SHA `5211bcb9f08a8e500165486dc1fa064b99f4b4d3`. Both Node 22 Ubuntu and Windows authorization jobs passed, including the new late-callback negative, the original positive FIFO/authorization tests, scoped SCO integration, static checker runs, and Ubuntu real-browser examples. The corrected test asserts that the late invocation rejects with `RPC isolation execution scope has closed` and that the private operation count remains zero.

To reproduce, run `node --test test/sco-rpc-isolation.test.js` after installing the repository's dependencies; for cross-platform coverage dispatch `.github/workflows/manual-sco-authorization.yml` against the desired pinned revision.

## Limits

This guard blocks **new late invocations after the isolation wrapper settles**. If a faulty integrator starts `execute()` while the wrapper is active and then releases its lock before awaiting the returned Promise, already-started work may continue outside the lock. The hook remains a trusted application integration contract. The repair does not revoke existing sessions, cancel remote methods, guarantee transaction isolation, prevent valid clients from relaying SCO answers, or establish a universal 2.5× bound. The added boolean check has no separate paired whole-session performance result; the successful workflow's sampled performance steps are not a causal overhead measurement for this repair.

**Decision:** Retain the narrowly scoped guard and test. Continue to require a correctly awaited isolation implementation and shared authorization-state lock. Do not promote this engineering safeguard into `results/`.
