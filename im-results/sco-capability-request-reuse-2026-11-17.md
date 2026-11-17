# Concurrent request-object reuse in SCO capability scope

**Status:** scoped correctness finding on the experimental Agent 12 SCO
capability branch, 17 November 2026. The default Node HTTP handler ordinarily
passes a distinct `IncomingMessage` object for each request. This regression
concerns integrators that reuse a request object concurrently, for example
an adapter re-evaluating its verified principal across overlapping logical RPC
calls. It is **not evidence of a remote cross-account HTTP authorization bypass**
against the ordinary one-request/one-object handler.

## Original failure and causality

In the proposed `createScoCapabilityScope`, the asynchronous
`principalOf(request)` result was stored in a single
`WeakMap<IncomingMessage,string>` keyed by the user-supplied request object.
The underlying `createScoKeyedIsolation` starts independent FIFO queues for
each resolved principal. Thus two overlapping calls made with the **same
request object** can resolve as different principals, and the second call can
overwrite or delete the first call's pending principal before its isolated
callback starts.

The deterministic test
[`test/sco-capabilities.test.js`](../test/sco-capabilities.test.js)
holds an Alice queue open, resolves a reused request once to Alice and once to
Bob, allows Bob's call to finish, and releases Alice. The first call must use
its own Alice resolution even though the second use of the same object has
settled. Previously its `resolved.get(request)` returned `undefined`;
the callback failed with
`Authenticated RPC principal is unavailable`. No wrong-account private
callback execution was observed in this recorded test. A separate standalone
reproduction with the same weak-map indexing pattern demonstrated that a
different interleaving can read the later principal; this is a model
observation, **not** a pinned result against the actual library.

**Exact pre-fix cross-platform red:** manually dispatched
[workflow 44152171478](https://github.com/FlareZ123/obfs/actions/runs/44152171478)
at branch commit `77a98ccb19ea73ae0386adc8b3a518957e374cac`.
Both Ubuntu Node 22 and Windows Node 22 executed six passing capability unit
tests and one failing reused-request regression. The failure was
`Authenticated RPC principal is unavailable` at
`src/sco-capabilities.js:51` on both systems. The temporary workflow ran the
focused test before typechecks, so this red run did not attempt JSDoc.

## Narrow change

`src/sco-capabilities.js` now creates a distinct
`ScoScopeState` within `AsyncLocalStorage.run` **for each
`runRpcIsolated` invocation**. The asynchronous resolver writes its principal
into that invocation's own state; the queued private operation activates that
state only while its callback is awaited. The per-request `WeakMap` and
shared-object deletion are removed. The existing keyed FIFO implementation,
authorization callbacks, API signatures and public handle contract stay the
same.

**Exact post-fix two-platform green:** manually dispatched
[workflow 44152339554](https://github.com/FlareZ123/obfs/actions/runs/44152339554)
at `7e8a55dba842a66df63d5886e4f23ec63e0af8a4`.
Both Ubuntu and Windows passed all **7/7** capability tests and both
`npm run typecheck` and `npm run typecheck:external`.
The manual workflow was temporarily shortened on this *research branch* for
red/green attribution, then restored to the pre-existing shared workflow
content in commit `b1a566e0bfeb71ff8016390034b2c3d570736bc8`.
This pin is a focused test result, **not** a whole-repository release gate.

## Boundaries and next evidence

The test uses a resolver whose verified identity changes across two logical
invocations of the same synthetic request object. A production server must
still verify each actual HTTP request through an authenticated session, and
`authorizeRpc` plus `authorizeOperation` remain the application policy
boundaries. Unknown integrations that never reuse request objects were not
shown to be exposed. The replacement relies on the documented Node 22
`AsyncLocalStorage.run` async-context propagation semantics.

This work improves API correctness under a deliberately adversarial schedule.
It does not alter the server-private source confidentiality, authorized
same-account relay limitation, independent client attacker cost, or the
unproved full-session 2.5× compute bound of the experimental SCO handle
candidate. Broader actual HTTP regression, source-private/attack comparison,
and performance release veto remain the responsibility of the parent
candidate evaluation.
