# SCO server-side source authorization

The programmatic `createScoHandler(sourceFiles, options)` API supports two independent authorization callbacks:

- `authorizeRead(request)`: optional sync or async callback evaluated before every valid GET of an obfuscated JavaScript file **or** static asset under `routePrefix`. A falsy result returns HTTP 403 with an empty body; an exception returns HTTP 500 without exposing the internal error. Missing files still return 404 before the callback.
- `authorizeRpc(request)`: required when using `remoteMethods`. It authorizes JSON POST calls to the server-resident operation registry. It is independent of `authorizeRead`; applications must enforce the intended policy for both.
- `authorizeOperation(request,method,args)`: optional sync/async request-aware, **method-and-arguments** policy. Evaluated after validating the request JSON and registered method, before running that operation. Falsy results return HTTP 403; thrown errors are collapsed to HTTP 500 without revealing private exception information. It does not replace the required coarse `authorizeRpc` gate.

## Handler-owned authorization configuration

SCO retains a private, construction-time snapshot of request policy wiring:
`allowedHosts` is copied, the original callable `remoteMethods`
references are copied into a handler-private operation map, and each
authorization callback is captured by reference. The dispatcher retains
its existing strict-mode unbound function invocation: preserving the
original function object is also necessary for nested batch-policy
preflight, whose verified operation metadata is attached by identity. Mutating the original
options object, its host array or its operation-method registry after
handler construction can no longer redirect a deployed handler's
route restriction or replace its registered server functions. Live
credential rotation remains possible through state intentionally read
by the **original captured callback**, for example a mutable session
database or keyring used by `authorizeRpc`.

This eliminates accidental time-of-check/time-of-use configuration drift
inside the trusted Node process. It does not prevent a server attacker
from replacing executable code or monkeypatching runtime internals;
the SCO threat model already assumes that the trusted server cannot
be compromised. Public HTTP `Host` headers are still forgeable and
must never be used as authentication. Server-side authorization
callbacks remain required when serving restricted code or RPCs.
The original vs mutated configuration behavior is exercised through
real HTTP requests by
[`test/sco-policy-configuration-snapshot.test.js`](../test/sco-policy-configuration-snapshot.test.js).

## Explicit public source-file allowlist

For source-private SCO integrations, pass `publicPaths:['entry.mjs','assets/app.css']`
to `createScoHandler` along with the intentionally public source files. This
optional **positive publication boundary** must exactly match the supplied
`sourceFiles` paths, including public assets. The server refuses startup if
an extra unlisted file appears, an allowed file is omitted, a path is
noncanonical, or names collide case-insensitively. For example, when the
operator has reviewed only `partition.clientFile.path`, use:

```js
createScoHandler([partition.clientFile],{
  publicPaths:[partition.clientFile.path],
  authorizeRead:verifyReadSession,
  authorizeRpc:verifyRpcSession,
  remoteMethods:privateMethods
});
```

The three policy callbacks and registry in this sample are application-defined.
This check is independent of the compiler's optional transitive
`privateModuleSources` graph audit and rejects an accidentally included
private source even when its runtime dependency cannot be statically inferred.
It does **not** authenticate requests, discover missing private paths, prevent
an operator from approving a private file as public, or protect any separate
web server route. It adds no per-request transformation/runtime computation;
all comparisons occur at handler construction. SCO also takes a byte-exact
owned snapshot of any caller-supplied asset `Buffer` when constructing the
handler, before source-disclosure preflight. Mutating the caller's original
buffer or an alias after setup cannot silently change the bytes delivered by
later GET requests. The one-time copy consumes memory proportional to the
asset size; behavior is covered by
[`test/sco-asset-buffer-snapshot.test.js`](../test/sco-asset-buffer-snapshot.test.js). Omitting `publicPaths` keeps
legacy behavior. A real HTTP demonstration of the default accidental
publication and positive-allowlist refusal is in
[`test/sco-public-file-allowlist.test.js`](../test/sco-public-file-allowlist.test.js).

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

## Automatic closed-graph private dependency refusal

When `partitionScoAsyncGraph` receives a complete private ESM graph with
explicit public `exposedPaths`, it now attaches its non-exposed module
paths to every generated `clientFile.privateModulePaths`. This metadata
is held by the trusted integration, independently of the executable
JavaScript sent to clients. Passing a generated facade and any original
non-exposed private module to `createScoHandler` in either order causes
a constructor-time refusal before HTTP route construction.

The paired [real HTTP negative-control and two-platform test](../im-results/sco-graph-publication-manifest-2026-11-16.md)
shows that a handler built with the same facades stripped of the marker
would accidentally serve a source canary through HTTP 200. Every generated graph facade additionally carries
`privateOriginalDigests`, a SHA-256 digest list of **all original ESM
input source bytes**, including modules explicitly selected in
`exposedPaths`. The handler checks any candidate public file's exact
source bytes against those digests before creating its HTTP routes. This
prevents accidentally shipping the original implementation of an exposed
API instead of its generated facade, or copying an unchanged private
dependency under a different filename. The metadata stays server-side;
the HTTP response contains only the generated JavaScript.

These checks are bounded deployment-mistake safeguards for the particular
supplied graph. Altering a single source byte evades exact fingerprints,
stripping generated metadata disables the corresponding guard, and a
separate public server can still publish files outside this handler.
They cannot establish hostile-runtime tamper resistance or prevent
legitimate authenticated RPC relaying. The stronger `publicPaths`
positive allowlist remains recommended to reject unreviewed file paths,
irrespective of their content.

The pinned [Linux/Windows exact-source regression at c893a84](https://github.com/FlareZ123/obfs/actions/runs/43854468508)
exercises both original-exposed-module replacement and a renamed
private dependency; it includes a real HTTP source-leak negative control
with fingerprint metadata intentionally omitted. Both Node 22 jobs
and strict SCO graph JSDoc passed.

## Preferred private-graph handler composition

Use `createScoGraphHandler(graph,originalNamespaces,options)` to build the
HTTP handler for a `partitionScoAsyncGraph` result. This helper binds exactly
the original server-resident exports, selects exactly `graph.clientFiles`,
and applies `publicPaths` from the graph's explicit `exposedPaths` rather
than accepting a separate caller-assembled file list. It refuses options
that attempt to override `publicPaths` or `remoteMethods`. A mismatched
generated RPC endpoint and handler `routePrefix` also causes startup to
fail instead of silently breaking the generated facades.

`originalNamespaces` must refer to the native ESM exports loaded privately
on the trusted server. Configure `authorizeRpc` to validate every request
and `authorizeOperation` for method-specific and argument-specific policies.
`authorizeRead` is available independently for public facade delivery.
The helper cannot establish trustworthy user identity by itself, enforce
authorization outside this handler, or prevent unlimited authorized
queries and response relays.

The runnable [three-module HMAC example](../examples/sco-graph/server.cjs)
uses this helper. At exact SHA `b8ba88d3a337cd3a03ed588a0b34deeedd65cd3d`,
the [Linux/Windows Node 22 gate](https://github.com/FlareZ123/obfs/actions/runs/43856454956)
verified real generated facades, the native-vs-RPC results, independently
authorized HTTP routes, and rejection of an extra source file, original
module substitution, override attempts, and endpoint mismatches. Strict
JSDoc passed on both platforms. This is an integration safety improvement,
not a hostile-client confidentiality or universal performance proof.

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

### Reusable per-principal isolation helper

`createScoKeyedIsolation(principalOf,{maxPendingPerPrincipal?,maxPendingTotal?})`
provides a small in-process FIFO queue compatible with
`createScoHandler`'s `runRpcIsolated` hook. Each verified principal's
authorization checks and method execution are serialized, while different
principals retain independent queues. A failed operation releases its queue,
and the last completed request removes the idle queue entry. Set a positive
integer `maxPendingPerPrincipal` to cap the total active **plus waiting** RPC
calls for each account. Set `maxPendingTotal` to cap the aggregate across
**all** accounts in the current process. Either cap denies admission before
authorization or private method execution and returns generic HTTP **429**.
Both limits are unlimited by default for existing integrations. These
caps bound retained queue state after request-body parsing and principal
verification, which still consume resources before admission.

```js
const {createScoHandler,createScoKeyedIsolation}=require('./src');
const runRpcIsolated=createScoKeyedIsolation(async request=>{
  const session=await authenticateRequest(request);
  return session.accountId;
},{maxPendingPerPrincipal:8,maxPendingTotal:512});
const handler=createScoHandler(publicFiles,{
  remoteMethods,
  authorizeRpc:authenticateRequest,
  authorizeOperation:checkOperation,
  runRpcIsolated
});
```

`authenticateRequest`, `publicFiles`, `remoteMethods` and `checkOperation`
are application-provided. The key resolver must authenticate and use a
server-verified, stable account/session identity. Never derive the lock key
directly from an unverified client-chosen header, which permits adversarial
key proliferation and defeats per-account serialization. Invalid identity
values cause the generic RPC 500 path; reject invalid credentials explicitly
through application policy. Keep lock and authorization identity aligned.

A busy error raised by the isolated **private method** is still a generic
HTTP 500; only a queue rejection before any protected work begins is 429.
A finite `maxPendingTotal` sets a process-local aggregate outstanding
operation cap, but is **not** a fair scheduler: a burst from one account may
consume all slots and temporarily reject requests for other accounts.
Neither limit stops unlimited *serial* authorized requests.
Use front-door limits and verified authentication in addition to this helper.

This helper protects only calls through the same in-process instance. It
cannot synchronize Node workers, cluster processes, other services, database
writers or permission changes outside this handler. For those deployments
use a shared transactional database or distributed lock with the required
isolation semantics. Long-running operations retain their principal's queue
until settlement; the helper has no timeout and must not be used recursively
for the same principal. FIFO order is the order of completed identity
resolution and queue registration, not a network arrival guarantee.

An isolator does not make a batch transactionally safe. Continue using
`preflightScoBatchState` or disallow state-changing operations in batches.
See `test/sco-keyed-isolation.test.js` for parallel HTTP revocation and
independent-principal FIFO/failure regressions, and
`test/sco-keyed-capacity.test.js` for bounded-queue and 429/500 classification
regressions. This is an SCO
server authorization control, not client-side anti-debugging or a proof
of the project's universal 2.5× compute target.

## Limits

The client still receives executable JavaScript and may retain, trace, debug, modify, replay, or redistribute it. Source delivery authorization only controls which requests the trusted SCO server fulfills. Do not put server secrets inside delivered JavaScript, and do not use the `Host` header as an identity proof. Keep sensitive algorithms or secret-dependent operations on the server through `remoteMethods`; account for network cost under the 2.5x runtime budget.

The optional read gate is applied after a file is located and before either the asset bytes or newly obfuscated source is delivered. Authorize all relevant resources and ensure any deployment-level caching is compatible with the intended per-request access controls. In particular, do not permit a publicly shared cache to serve previously authorized responses to unauthenticated clients.
