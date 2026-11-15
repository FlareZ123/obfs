# SCO server-side source authorization

The programmatic `createScoHandler(sourceFiles, options)` API supports two independent authorization callbacks:

- `authorizeRead(request)`: optional sync or async callback evaluated before every valid GET of an obfuscated JavaScript file **or** static asset under `routePrefix`. A falsy result returns HTTP 403 with an empty body; an exception returns HTTP 500 without exposing the internal error. Missing files still return 404 before the callback.
- `authorizeRpc(request)`: required when using `remoteMethods`. It authorizes JSON POST calls to the server-resident operation registry. It is independent of `authorizeRead`; applications must enforce the intended policy for both.
- `authorizeOperation(request,method,args)`: optional sync/async request-aware, **method-and-arguments** policy. Evaluated after validating the request JSON and registered method, before running that operation. Falsy results return HTTP 403; thrown errors are collapsed to HTTP 500 without revealing private exception information. It does not replace the required coarse `authorizeRpc` gate.

Example (CommonJS):

```js
const http = require('node:http');
const {createScoHandler} = require('./src');

const handler = createScoHandler(
  [{path:'client.js',sourceType:'script',code:'globalThis.ready=true;'}],
  {
    authorizeRead: async request => {
      // Verify a server-issued session here using your normal auth stack.
      return Boolean(await verifyUserSession(request));
    },
    remoteMethods: {protectedOperation: async () => protectedServerValue()},
    authorizeRpc: async request => Boolean(await verifyUserSession(request)),
    authorizeOperation: async (request,method,args) =>
      Boolean(await verifyUserSession(request)) && isPermittedOperation(method,args)
  }
);
http.createServer(handler).listen(8080);
```

This is a conceptual example: `verifyUserSession`, `protectedServerValue` and `isPermittedOperation` are application-supplied functions. The obfuscator does not generate user accounts or tokens.

## Generated browser RPC facade

`createScoRpcClientSource(methodNames, {endpoint?})` emits a standalone ES module for modern browsers. The generated source includes method names and a JSON-over-HTTP transport, while the actual function bodies remain on the SCO server. Its default same-origin endpoint is `/obfs/rpc`; specify a same-origin absolute path when using a custom `routePrefix`. The generator rejects duplicate method names and cross-origin or protocol-relative endpoints.

```js
const {createScoHandler,createScoRpcClientSource}=require('./src');
const files=[{
  path:'remote.mjs',
  sourceType:'module',
  code:createScoRpcClientSource(['protectedOperation'])
}];
const handler=createScoHandler(files,{
  authorizeRead:request=>Boolean(verifyUserSession(request)),
  remoteMethods:{protectedOperation:async value=>protectedServerOperation(value)},
  authorizeRpc:request=>Boolean(verifyUserSession(request))
});
```

The application serves `remote.mjs` via the SCO handler, then the browser imports it:

```js
import remote from '/obfs/remote.mjs';
const answer=await remote.protectedOperation('input');
```

Both authorization checks are integrator-defined; `verifyUserSession` and `protectedServerOperation` are example placeholders. The generated client sends cookies for same-origin requests using `credentials:'same-origin'`; other authorization mechanisms need an application-specific client. All generated methods are asynchronous, return JSON-compatible values, and throw the same generic error for non-success RPC responses. Cross-origin credential forwarding is intentionally unsupported.

This facade does not automatically extract arbitrary JavaScript statements into server operations. Choose server-resident operation boundaries explicitly and benchmark total browser-to-server round trips against the 2.5× compute requirement. Authorized attackers can make arbitrary method calls and learn from results, so access controls, request quotas, and monitoring remain essential.

## Bounded sequential RPC batching

Use `createScoBatchMethod` to reduce the number of HTTP round trips for multiple independently named operations. The helper checks all requested method names and argument arrays before any operation is invoked, caps each batch to `maxCalls` (64 by default, up to 1,024), then awaits the requested operations **in order**. Runtime failures are returned as generic per-item results. No privileged server implementation is copied into the client.

```js
const {createScoHandler,createScoRpcClientSource,createScoBatchMethod}=require('./src');
const operations={compute:async value=>protectedComputation(value)};
const handler=createScoHandler([{
  path:'remote.mjs',
  sourceType:'module',
  code:createScoRpcClientSource(['batch'])
}],{
  remoteMethods:{batch:createScoBatchMethod(operations,{maxCalls:32})},
  authorizeRpc:request=>Boolean(verifyUserSession(request)),
  authorizeRead:request=>Boolean(verifyUserSession(request))
});
```

The browser imports `remote` and submits an explicit ordered batch:

```js
import remote from '/obfs/remote.mjs';
const results=await remote.batch([
  {method:'compute',args:[10]},
  {method:'compute',args:[20]}
]);
// Each result is {ok:true,value} or {ok:false,error:'Operation failed'}.
```

The examples use application-supplied placeholder functions. The same outer `authorizeRpc` check protects the entire batch. For a batch created by `createScoBatchMethod`, an installed `authorizeOperation` callback now runs for the outer batch and **each structurally valid inner call**, before any batch side effects. The callback must permit both the batch method and every authorized inner method. Denying a later call blocks execution of the entire batch. An inner policy exception returns a generic HTTP 500 without exposing the exception. Invalid batch structures are still rejected by the batch helper. A batch helper may not be registered inside another batch helper even under a different operation name; this rejects nested recognized helpers whose deeper operations would otherwise bypass the single-level policy preflight. Custom wrappers around batch functions remain outside automatic recognition and must implement their own authorization preflight. Custom batch functions that do not originate from `createScoBatchMethod` have no automatic inner inspection; implement their own preflight authorization. `maxRpcBytes` still bounds request body size. If an operation performs side effects and later calls fail, earlier completed operations remain committed; batching is sequential and is **not transactional**. The helper rejects malformed batches before execution. Avoid registering unrestricted methods that an authenticated user should not invoke. Benchmark both latency and resource consumption under your deployment's real network and concurrency.


## Authorization state changes within one batch

The handler checks a recognized batch's outer method and all inner calls **before**
executing any member. This preserves the no-partial-effect behavior for initially
denied calls, but the checks describe the state at preflight time. A batch
containing `revoke` followed by `read` can therefore execute `read` after
`revoke` has invalidated the permission that previously allowed it. Two
separate RPC requests, with revocation first, reject the second request under
the same state-dependent policy. The behavior is reproduced in
`test/sco-batch-state-drift.test.js`. The batch helper does not implement
transaction isolation or mid-batch reauthorization.

Applications that need sequential permission semantics can supply a pure
transition model to `preflightScoBatchState(calls, initialState, policy)` from
`require('./src')`. Call it in `authorizeOperation` for the outer batch
method, before any protected operations execute. The helper checks each
modeled step against the state **after all preceding modeled transitions**:

```js
const {preflightScoBatchState}=require('./src');

const policy={
  authorize:(active,method,args)=>active &&
    (method==='read'||method==='revoke') && args.length===0,
  transition:(active,method)=>method==='revoke'?false:active
};

function authorizeOperation(request,method,args) {
  const active=readConsistentSessionSnapshot(request);
  if(method==='batch') {
    return args.length===1 &&
      preflightScoBatchState(args[0],active,policy);
  }
  return policy.authorize(active,method,args);
}
```

`readConsistentSessionSnapshot` is an application-defined placeholder.
The modeled `read,revoke` sequence is admitted, whereas `revoke,read` is
rejected before any operation runs. The policy callbacks must be synchronous,
pure and complete for every state-changing operation. The integrator must
also ensure the snapshot remains consistent between preflight and execution
through an application transaction, serialization, or equivalent control.
Without this guarantee, another request may change permissions after the
check. The helper cannot ensure rollback, prevent concurrent changes, or
verify that the model matches the real methods. A simpler safe policy is
to prohibit permission-mutating operations in batches altogether.

For partitioned RPC methods, the policy must use the actual method IDs
from `partition.methodNames` rather than assuming public export names
are the RPC method names. The bounded finite-state regression in
`test/sco-batch-state-model.test.js` checks 510 ordered traces; it is a
model-specific comparison, not a general authorization proof.


## Concurrent authorization and RPC isolation

An application-supplied transition model can reject impossible sequences
**inside one batch**, but a second RPC can change the authoritative session
state while a permitted batch is executing. The native HTTP interleaving in
`test/sco-rpc-isolation.test.js` demonstrates the difference: one request
begins a two-read batch and pauses the first read, then a concurrent request
revokes the session. Both preflighted reads continue after revocation because
the second request interleaved between their authorization and execution.

For integrators with stateful permissions, the optional
`createScoHandler(...,{runRpcIsolated})` hook surrounds the coarse
`authorizeRpc`, every `authorizeOperation` check and the protected method
execution. It runs **after** bounded request-body parsing, avoiding holding
a session lock while a remote client streams its body. Supply a callback that
acquires the appropriate session or account lock (or begins an application
transaction), **awaits `execute()` exactly once**, and releases the lock
after the returned promise settles.

```js
const handler=createScoHandler(publicFiles,{
  remoteMethods,
  authorizeRpc:verifySession,
  authorizeOperation:checkOperation,
  runRpcIsolated:async (request,execute)=>{
    await sessionLockFor(request).runExclusive(execute);
  }
});
```

`publicFiles`, `remoteMethods`, `verifySession`, `checkOperation`
and `sessionLockFor` are application-supplied placeholders. The lock
implementation must protect *all* other server operations that may mutate
the same authorization state, including operations outside this handler.
Per-session keyed locks can retain concurrency between independent users.
A database transaction is appropriate only when it also isolates every
side effect the policy depends on. A callback which invokes `execute` twice,
returns without awaiting it, or releases its lock early cannot provide the
promised isolation. Server exceptions are still masked from the client.

The hook is optional. With the hook unset, existing early coarse
authorization and request behavior remain unchanged. When the hook is
provided, the body is validated and size-bounded before coarse
authorization, so a caller might receive a syntax/size response before
a forbidden response. Unauthorized callers can still send up to
`maxRpcBytes` of body data. Deploy front-door request limits and
timeouts as appropriate. A mutex can serialize calls across request
boundaries, but it is not a general rollback mechanism and does not
prevent unlimited legitimate oracle queries.

## Limits

The client still receives executable JavaScript and may retain, trace, debug, modify, replay, or redistribute it. Source delivery authorization only controls which requests the trusted SCO server fulfills. Do not put server secrets inside delivered JavaScript, and do not use the `Host` header as an identity proof. Keep sensitive algorithms or secret-dependent operations on the server through `remoteMethods`; account for network cost under the 2.5x runtime budget.

The optional read gate is applied after a file is located and before either the asset bytes or newly obfuscated source is delivered. Authorize all relevant resources and ensure any deployment-level caching is compatible with the intended per-request access controls. In particular, do not permit a publicly shared cache to serve previously authorized responses to unauthenticated clients.
