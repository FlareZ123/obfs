# SCO discarded execute promise can crash trusted Node service (17 November 2026)

**Status:** reproducible bounded availability regression with independent
two-platform red/green CI, under a deliberately faulty isolation integrator.
The finding concerns the trusted SCO server API, not code obfuscation resistance.

## Fault model

A trusted integrator supplies `runRpcIsolated(request,execute)` and is
contractually required to await `execute()` exactly once while maintaining a
mutex or transaction. In the incorrect variant, it starts `execute()` and
ignores its promise:

```javascript
runRpcIsolated: async (_request, execute) => {
  void execute();
}
```

The handler correctly refuses future protected work after the wrapper returns.
However, when `authorizeRpc` resumes asynchronously and the isolation scope is
already closed, the orphaned `execute()` promise rejects. With
`node --unhandled-rejections=strict`, an unobserved rejection terminates the
trusted Node process. A client receives generic HTTP 500 and executes no
private method, yet future clients can be denied service by the crash.

This faulty integration is **outside the documented correct API contract**.
The server's own isolation guard should still avoid turning the integrator's
mistake into a process-level unhandled rejection.

## Reproducible red and green

The child-process fixture
`sims/sco-detached-unhandled-fixture.js` starts the real SCO server,
delays `authorizeRpc` until the next event-loop turn, issues a real
HTTP POST to `/obfs/rpc`, expects generic HTTP 500 with JSON
`{"ok":false,"error":"Operation failed"}`, and confirms the registered
private method is never entered.

`test/sco-detached-unhandled.test.js` runs the fixture with Node 22's
`--unhandled-rejections=strict` in a separate process and checks its exit
status, preventing a negative case from crashing the parent test runner.

- **Red:** [CI 43999023635](https://github.com/FlareZ123/obfs/actions/runs/43999023635),
  at exact SHA `1dc538406818d35e8b3392dce58b98a1c56761df`,
  reproduced **one** new failing test per OS. The child exited status 1
  with `TypeError: RPC isolation execution scope has closed` at
  `src/sco.js`; the surrounding SCO suite continued to pass.
- **Fix:** [commit 0f866d0](https://github.com/FlareZ123/obfs/commit/0f866d03a236c2f63c8ef89b6d1a129d9650afe7)
  returns the **original rejecting promise** from the callback and
  attaches a no-op rejection observer to it immediately. This preserves
  normal awaiting callers' rejection and prevents a discarded promise
  from causing an unhandled-rejection server crash.
- **Green:** [CI 43999308537](https://github.com/FlareZ123/obfs/actions/runs/43999308537),
  at the exact fix SHA `0f866d03a236c2f63c8ef89b6d1a129d9650afe7`,
  completed with **163/163 tests passed on Ubuntu**, and
  **162 passed, one skipped, zero failed on Windows**. Both OSes ran
  the target strict child-process fixture successfully and completed
  the rest of the manual SCO authorization gate.
- Contract text updated in `docs/SCO_AUTHORIZATION.md`.

## Scope and residual

The rejection observer is attached to each internal execution promise.
It does **not** make the integrator's early lock release safe; protected
methods already entered may still finish or have irreversible side effects.
Correct wrappers must continue awaiting execution while holding their
isolation scope. The generic HTTP 500 response, refusal of post-scope
private work, and unchanged original promise rejection were already
documented and checked in the adjacent
`im-results/sco-detached-inflight-authorization-2026-11-17.md`.

This is a trusted-service availability robustness improvement. It neither
protects the server from trusted-method bugs nor prevents legitimate SCO
oracle relaying, and it supplies no evidence that the stipulated full-control
COO or SNO attacker is resisted. The added observer has constant per-RPC
promise bookkeeping; no independently paired full-workload 2.5× proof was
produced for this specific patch.
