# Registered nested SCO batch authorization gap, refused at construction

Date: 2026-11-15. Agent 7. Reproduced security boundary regression in an opt-in server-side API.

## Issue

`createScoHandler` preflights an outer recognized `createScoBatchMethod` and every direct inner method via `authorizeOperation`. A helper created by `createScoBatchMethod({privateOp:...})` was formerly admissible as a callable value inside a **second helper** under an alternate name such as `createScoBatchMethod({nested:inner})`. The registry rejected literal key `batch` but did not recognize another helper under key `nested`. This allowed a server integrator's configuration to accidentally execute nested operations after policies had examined only `batch` and `nested`, not `privateOp`. The issue is limited to this concrete recognized-helper composition: arbitrary wrapper functions remain the integrator's responsibility.

## Reproduction and fix

`test/sco-batch-policy-closure.test.js` now asserts rejection for both `createScoBatchMethod({nested:inner})` and a literal `batch` key. The first assertion failed under the original implementation on both platforms in manually dispatched [run #43691849286](https://github.com/FlareZ123/obfs/actions/runs/43691849286), source commit `f0ee1daa`.

`src/rpc-batch.js` now tests `recognizedBatches.has(task)` for each new registry operation in addition to literal `batch` and nonfunction rejection. A direct already recognized nested helper is refused with a descriptive TypeError, preserving the single-layer per-item authorization contract. The modified targeted SCO HTTP+partition and strict JSDoc suites passed on both Ubuntu and Windows in [run #43691896795](https://github.com/FlareZ123/obfs/actions/runs/43691896795), source commit `339eb189`.

## Scope

This is fail-closed validation of registered helper composition, not a general proof about arbitrary user-supplied wrapper functions or per-operation authorization policies. Custom wrappers can conceal side effects and must be audited by their integrator. The method-level trust boundary remains an application responsibility. The helper fix avoids accidentally implying that nested batches are authorized by the outer batch's single-layer preflight and does not change the SCO attacker model's unlimited legitimate query allowance.
