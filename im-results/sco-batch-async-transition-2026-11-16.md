# SCO batch-state model: asynchronous transition misconfiguration

**Status:** bounded, reproducible correctness defect and fail-closed repair; not an obfuscation-security result.

## Contract and counterexample

`preflightScoBatchState(calls,initialState,policy)` documents a **pure synchronous** application-supplied state-transition model. Its existing guard rejected a nonboolean or Promise-valued `authorize` result, but it did not inspect the result of `transition`. For example:

```js
const calls=[{method:'revoke',args:[]},{method:'read',args:[]}];
const policy={
  authorize:state=>Boolean(state),
  transition:async()=>false
};
// Before repair: preflightScoBatchState(calls,true,policy) === true.
```

After the first operation, the state is a Promise instead of the intended `false`; the next `authorize` sees a truthy object. A **single-element** `revoke` batch also returned `true`, since the final modeled transition had no subsequent authorization call. The source-level miniature reproducer was executed on Node 22.16.0 and returned `{one:true,two:true}` with these two inputs. This is a policy-author misconfiguration case under a trusted server, not an untrusted-client ability to alter the server's transition callback.

## Change and executable checks

`src/rpc-batch-policy.js` now rejects native Promises or arbitrary callable thenables returned from **any** transition and rejects a thenable initial state. It throws `TypeError` under the documented synchronous policy contract, following the existing nonboolean-authorization check. The HTTP handler catches authorization exceptions and sends a generic 500 before private method execution.

`test/sco-batch-state-async-transition.test.js` covers:
- Last-step and intermediate async transition rejection.
- Custom non-Promise thenables and thenable initial state.
- A synchronous object-state positive control and sequential revocation refusal.
- A native loopback HTTP batch request proving generic error and **zero** private operation effects on the rejected policy.

The existing manual SCO authorization workflow includes the file. The initial Linux/Windows gate [43954351253](https://github.com/FlareZ123/obfs/actions/runs/43954351253) passed at immutable commit `46bc5c1c928796f3a37757dde3980b51decfac94` before the final HTTP case was added: Ubuntu and Windows jobs both successful, including the targeted SCO suite, simulation steps and strict JSDoc checks. The expanded HTTP test was subsequently included in a **successful Ubuntu/Windows gate** [43954881123](https://github.com/FlareZ123/obfs/actions/runs/43954881123) pinned to exact commit `abd91f8b613cbb6ee1f84b58da97c1375a36abd6`. A later combined batch/authorization gate [43957937021](https://github.com/FlareZ123/obfs/actions/runs/43957937021) also passed both operating systems and strict JSDoc at `b6f8fd54c41c70816b466da7d8e1af949dca9d26`.

## Scope

This narrows accidental batch-state authorization mistakes while keeping policy callbacks entirely server-resident. It does not make a mis-specified pure transition model faithful to actual state changes, provide concurrency isolation, enforce transaction rollback, stop authorized relaying, or make the distributed SCO client harder to reconstruct. The new per-step thenable check is constant work in the ordinary synchronous case, but **no standalone or whole-session 2.5× performance conclusion** follows from this test gate. Arbitrary JavaScript getters/proxies in application-owned state can still have side effects and are outside the documented pure-model contract.

Implementation: `src/rpc-batch-policy.js`; tests: `test/sco-batch-state-async-transition.test.js`; integrator guidance: `docs/SCO_AUTHORIZATION.md`.
