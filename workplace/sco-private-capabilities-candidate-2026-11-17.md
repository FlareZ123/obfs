# SCO server-private capability handles (experimental)

**Status:** branch-only integration prototype, 17 November 2026. This is a
server-trust architecture candidate and a narrowly tested API. It is not a
general JavaScript secrecy or hostile-client execution-lock claim.

The SCO public facade can return a 256-bit random, URL-safe handle while the
referenced object remains in the trusted server's memory. The handle is bound
to a server-verified principal and expires. Cross-principal replay, malformed
handles, detached asynchronous calls, and capacity overruns are rejected.
A legitimate principal can still relay its own authorized requests. A
compromised trusted server can bypass all of these checks.

## Wiring to the existing SCO RPC handler

```js
'use strict';
const {createScoHandler,createScoCapabilityScope,createScoPrivateHandles}=
  require('./src');

// Authenticate from a *verified* server-side session. This is an interface
// sketch: the application's own session verifier supplies this function.
const scope=createScoCapabilityScope(principalFromVerifiedSession,{
  maxPendingPerPrincipal:32,maxPendingTotal:512
});
const handles=createScoPrivateHandles(scope.currentPrincipal,{
  ttlMs:300000,maxHandles:4096,maxHandlesPerPrincipal:256
});
const remoteMethods={
  begin:async()=>{
    const privateValue=await constructPrivateStateOnServer();
    return handles.issue(privateValue);
  },
  readPublicProjection:async handle=>
    handles.use(handle,privateValue=>deriveReviewedPublicProjection(privateValue)),
  close:async handle=>handles.revoke(handle)
};
const handler=createScoHandler(compiledPublicFacades,{
  remoteMethods,runRpcIsolated:scope.runRpcIsolated,
  authorizeRpc:request=>authorizeVerifiedRequest(request),
  authorizeOperation:(request,method,args)=>authorizePrivateOperation(request,method,args),
  publicPaths:reviewedFacadePaths
});
```

All identifiers in the sketch such as `principalFromVerifiedSession`,
`constructPrivateStateOnServer`, `compiledPublicFacades`, and the
authorization callbacks are application functions, not library APIs.
Only publish compiler-reviewed public facades. The server must never expose
the private state constructor, state store or projected-secret internals.

## Contract

- `createScoCapabilityScope(principalOf,options)` delegates principal
  validation and FIFO request capacity to the existing
  `createScoKeyedIsolation` implementation. It exposes
  `runRpcIsolated(request,execute)` for `createScoHandler` and
  `currentPrincipal()` for trusted remote operations. The account resolver
  is invoked once per isolated RPC request.
- `createScoPrivateHandles(currentPrincipal,options)` exposes
  `issue(value)`, `use(handle,callback)`, and `revoke(handle)`.
  The server executes the callback and decides what result is public.
  There is no client API for enumerating stored values.
- Handles are 32 random bytes encoded as base64url (43 characters).
  Defaults are a five-minute monotonic TTL, 4,096 concurrent handles
  globally and 256 per principal. Expired values are lazily purged at
  capacity pressure or on access. These limits count entries rather than
  stored bytes. Values are references in process memory, without persistence,
  independent storage transaction guarantees or secure-memory erasure. In a
  multi-worker deployment, a handle minted in one Node process is unknown
  to another unless the integrator supplies sticky routing or replaces the
  in-memory store with a separately designed and authorized shared backend.
- **Token authorization is not object-graph ownership.** Values remain JS
  references and are not deep-copied. If trusted server code issues the same
  object, or distinct objects containing a shared nested reference, to two
  accounts, both accounts can observe its shared mutations through their
  separate *authorized* handles. The runnable negative canary is
  `sims/sco-private-shared-alias-canary.js`. Deployments requiring private
  per-principal mutable state must allocate disjoint state graphs or supply
  an independently validated isolation/clone policy. Do not infer state
  segregation solely from account-bound token lookup.
- A scope becomes inactive after the awaited request callback settles.
  Subsequent tasks that retained its asynchronous context cannot access the
  store through the API. Callbacks using previously captured private values
  remain the trusted server integrator's responsibility.
- Authenticated principals must come from verified cookies/session state or
  equivalent server-side verification. A client account header or JSON field
  alone is not authentication. `authorizeRpc` and
  `authorizeOperation` remain mandatory policy responsibilities.

## Explicit security hypothesis and tests

**Hypothesis:** On a representative SCO application with a server-private
state object that never reaches a public response, an offline attacker given
all shipped JavaScript/ESM bytes and expired or cross-account handles cannot
recover that object via source inspection or those handle APIs. The same
client-side minified implementation containing the state would disclose it.
This conditional claim depends entirely on trusted server separation.

**Attacker observations:** All public responses and handle values, requests,
their own authorized account, instruments/DevTools and unlimited legitimate
RPC queries. The attacker cannot compromise the server. Same-account
authenticated relaying is explicitly an expected success, as are any public
projections intentionally returned by the server.

**Precommitted rejection:** Reject the claim if a current public artifact
contains private state, if cross-account handle use reaches its callback, if
detached access succeeds, or if any unauthorized handler policy path executes
private work. An actual HTTP test with two verified accounts, a third-party
relay, and a fixed source hash is required before promotion.

**Performance veto:** Compare the same native/minified and SCO protected
application with separate client CPU, server CPU, network, cold startup and
short/sustained session boundaries on Node and real Chromium. Any measured
strict over-2.5× compute pair blocks a full project-performance claim. The
local standalone unit tests and JSDoc check do not establish this budget.

Initial local evidence: six tests of principal isolation, concurrent
context/FIFO behavior, failed resolver cleanup, detachment,
expiration/quotas and invalid inputs pass with the *actual*
`src/rpc-keyed-isolation.js` implementation, and TypeScript's strict JSDoc
check passes. The committed actual-SCO-handler HTTP and compiled-private-to-public
ESM tests have **not** yet been executed against the full repository.
Broader repository CI and HTTP adversarial comparison are
not yet established. Treat this as `workplace/` material.
