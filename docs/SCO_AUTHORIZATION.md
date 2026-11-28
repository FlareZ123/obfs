# SCO server-side source authorization

The programmatic `createScoHandler(sourceFiles, options)` API supports three authorization callbacks:

- `authorizeRead(request)`: optional sync or async callback evaluated before every valid GET of an obfuscated JavaScript file **or** static asset under `routePrefix`. Only the literal boolean `true` authorizes the read; all other results return HTTP 403 with an empty body; an exception returns HTTP 500 without exposing the internal error. Missing files still return 404 before the callback.
- `authorizeRpc(request)`: required when using `remoteMethods`. It authorizes JSON POST calls to the server-resident operation registry. The result must be the literal boolean `true` to allow a call, including when resolved asynchronously. It is independent of `authorizeRead`; applications must enforce the intended policy for both.
- `authorizeOperation(request,method,args)`: optional sync/async request-aware, **method-and-arguments** policy. Evaluated after validating the request JSON and registered method, before running that operation. Only the literal boolean `true` authorizes the operation; all other results return HTTP 403; thrown errors are collapsed to HTTP 500 without revealing private exception information. The callback receives an independent parse of the bounded JSON arguments, so edits to its input cannot redirect execution of the already submitted values. It does not replace the required coarse `authorizeRpc` gate.

**Boolean authorization contract:** Each configured callback must return the literal boolean `true` to grant its respective permission; `authorizeRpc` is mandatory for RPC, whereas the read and operation callbacks are optional. A truthy object (such as a verified session record), string, number or Boolean wrapper is refused even when it evaluates truthy in JavaScript; `false`, `null` and `undefined` are also refused. If your verifier returns a principal object, explicitly use `return Boolean(await verifyUserSession(request));` after independently validating that identity. This is a deliberate behavior change from the previous truthiness-based gate and may require integrator migration. Denied requests return 403; callback exceptions retain their generic 500 handling. This enforcement protects against accidental return-type confusion, not a compromised trusted SCO server or an authorization callback that intentionally returns `true` for an attacker.

## JSON transport byte validity

The SCO RPC handler requires the `application/json` media type and validates the
complete body as UTF-8 before JSON parsing. Malformed UTF-8 octets are rejected
as HTTP 400 `{"ok":false,"error":"Malformed JSON"}` before any
method-level authorization or private operation. Without RPC isolation,
the coarse `authorizeRpc` callback still runs before body parsing; with
`runRpcIsolated`, body parsing precedes the coarse gate. Both orderings
were established independently of UTF-8 validation. Node's permissive
`Buffer.toString('utf8')` normally replaces invalid sequences with U+FFFD;
a caller-supplied literal U+FFFD remains valid when encoded as its actual
three UTF-8 bytes. Validation occurs **after concatenating all body chunks**,
so a valid code point may span individual HTTP chunks.

This enforces valid UTF-8 transport bytes before ordinary JSON parsing. It
does **not** create a canonical JSON representation: differently escaped
strings and repeated object keys can still decode to equivalent or
implementation-dependent structures. Applications using request signatures
must verify exact signed bytes or define a separate canonicalization scheme.
The check does not authenticate callers, impose method-argument schemas or
prevent legitimate query relaying.
A bounded body-size check runs before UTF-8 validation. This extra validation
scans the received bytes, and its effect on the 2.5× runtime budget requires
application-specific profiling. The byte-exact Node HTTP regression is in
`test/sco-malformed-utf8-rpc.test.js`.

## JSON protocol envelope serialization

The response serializer constructs a null-prototype copy of its **own**
`{ok,...}` protocol envelope before calling `JSON.stringify`. An unrelated
trusted Node dependency can add `Object.prototype.toJSON`, which native
`JSON.stringify` otherwise invokes on every ordinary response object.
That inherited callback must not replace the handler's success, denial or
malformed-request envelope. The protected method's `value` is still
serialized using ordinary JavaScript `JSON.stringify` behavior, including
any explicit or inherited `toJSON` on nested application values. Thus this
guard preserves the handler-owned wire envelope without imposing a new
application-value serialization contract.

The real HTTP regression
[`test/sco-response-envelope-prototype.test.js`](../test/sco-response-envelope-prototype.test.js)
checks the exact response bytes under a temporary inherited `toJSON`
hook for a successful primitive-valued operation and generic denial cases.
This protects against accidental ambient prototype interference inside the
trusted server. It does not defend against an attacker able to monkeypatch
the server's `JSON.stringify`, compromise the Node runtime, or obtain
private results through legitimate authorized requests. The per-response
wrapper copy has not been independently profiled for a universal 2.5×
compute guarantee.

## Explicit own JSON operation keys

SCO RPC requires `method` and `args` to be **own properties** of the
received JSON object, in addition to requiring a registered method string
and an arguments array. Recognized `createScoBatchMethod` member calls and
the synchronous `preflightScoBatchState` helper similarly require own
`method` and `args` keys. A JSON object inherits properties from
`Object.prototype`; an unrelated trusted server dependency that adds
`Object.prototype.method` or `Object.prototype.args` must not silently
supply missing request fields or authorize a batch operation. Explicit JSON
members remain supported, including unrelated own `__proto__` data keys.

The real-HTTP and state-model regression
[`test/sco-owned-json-shape.test.js`](../test/sco-owned-json-shape.test.js)
uses controlled server-side prototype pollution and restores its original
descriptors. The admission policy refuses omitted keys without invoking
private operations. This is a bounded wire-format correctness hardening
under an otherwise trusted SCO process; it provides no new protection
against attackers who compromise the server runtime and can patch
the dispatcher. The additional own-key checks have not been separately
characterized against the complete 2.5× compute budget.

## Authorization timing under paced request bodies

For a non-isolated RPC request, `authorizeRpc` runs immediately after the
HTTP request begins, **before the server has read its complete JSON body**.
This is an admission-time authorization snapshot. A previously approved
client may deliberately send half of a valid JSON request, allow its
credential to be revoked, then finish the body. If the application uses
only `authorizeRpc`, the method still executes with the earlier approval.
The handler imposes no implicit second authorization check at execution
time. A strict execution-time revocation requirement therefore needs an
additional policy or isolation boundary.

With `runRpcIsolated`, body parsing completes first, and `authorizeRpc`
is evaluated inside the isolated `execute` callback. For a request that
pauses midway through upload, revocation before completion is observable
to the later authorization check. This changes request processing order,
as documented above, and does not guarantee atomicity against permission
changes after the check or changes in other processes. Use an application
transaction or state-aware `authorizeOperation` check for the intended
method-specific consistency boundary, and serialize the relevant
revocation transitions through the same isolation facility.

The real byte-paced HTTP regression in
[`test/sco-slow-body-authorization-race.test.js`](../test/sco-slow-body-authorization-race.test.js)
was verified in both Node 22 Linux and Windows jobs of
[manual authorization run 44020222950](https://github.com/FlareZ123/obfs/actions/runs/44020222950),
exact commit `ad0513b9a03aa0375053801464972f9e4346a349`. It
reproduces both outcomes with the same private method: unisolated
acceptance followed by a late revocation, and isolation-enabled refusal
after complete parsing. This is a behavior contract and operational
warning for time-sensitive credentials, rather than a claim that a
valid request was unauthorized at its initial admission. The effects of
request-body timing and isolation on runtime budget still require
deployment-specific measurement.

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

Accessor-backed startup configurations now retain their **first values**
for the method registry, authorization callbacks, request-body byte cap,
Host-header routing list and closed-world compiler selector. The Host list
is copied by indexed access, independent of a caller-owned iterator.
A callback's own closure may still observe live credential state.
This prevents construction-time validation against a restrictive getter
followed by deployment of a later, permissive getter value. Six actual HTTP
and compiler regressions live in
[`test/sco-request-policy-initial-snapshot.test.js`](../test/sco-request-policy-initial-snapshot.test.js).

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

An accessor-backed `publicPaths` property is read once and its array
entries are copied by indexed access before the reviewed-file comparison.
Custom iterators and subsequent getter values cannot widen that first
publication decision. The four-case test is
[`test/sco-public-allowlist-snapshot.test.js`](../test/sco-public-allowlist-snapshot.test.js).
These checks assume a trusted server integrator; intentionally publishing
private files outside the handler remains possible.

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
  authorizeOperation:(request,method)=>method==='batch'||method==='compute',
  batchPreflightRoutes:['batch'],
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

The examples use application-supplied placeholder functions. The same outer `authorizeRpc` check protects the entire batch. For a batch created by `createScoBatchMethod`, an installed `authorizeOperation` callback runs for the outer batch and **each inner call of an executable, completely validated batch**, before any batch side effects. The helper first checks the batch count against `maxCalls`, the registration of every method, and each arguments array. An invalid or oversized batch skips all inner authorization callbacks and still fails with the helper's generic HTTP 500 before executing any private operation. This avoids issuing unnecessary per-item policy or database checks for work that cannot execute. It intentionally changes the HTTP result for batches that an earlier inner callback would have rejected as HTTP 403; no invalid batch becomes executable. The callback must permit both the batch method and every authorized inner method. Denying a later call blocks execution of the entire batch. An inner policy exception returns a generic HTTP 500 without exposing the exception. Invalid batch structures are still rejected by the batch helper. A batch helper may not be registered inside another batch helper even under a different operation name; this rejects nested recognized helpers whose deeper operations would otherwise bypass the single-level policy preflight. `batchPreflightRoutes` makes reliance on this one-level automatic call-list inspection explicit. Every listed route must resolve directly to a recognized `createScoBatchMethod` helper when the handler is constructed, and a nonempty list requires `authorizeOperation`. A bound, proxied, forwarding, missing, or custom function listed there is rejected before the server starts, so a declared route cannot silently degrade to outer-only authorization. The guarantee covers the outer batch and the direct operation names present in that batch. It is not a transitive proof of work hidden inside an application-supplied leaf method. A leaf can call other functions, including a wrapped batch helper, and that composite behavior remains the integrator's policy responsibility. The helper rejects directly registered nested recognized batch helpers, while arbitrary wrappers cannot be reverse-mapped to their targets. The option is an explicit fail-closed route contract rather than a route-name heuristic: unlisted custom methods retain their existing semantics. Custom wrappers around batch functions remain outside automatic recognition and must implement their own authorization preflight. Custom batch functions that do not originate from `createScoBatchMethod` have no automatic inner inspection; implement their own preflight authorization. `maxRpcBytes` still bounds request body size. If an operation performs side effects and later calls fail, earlier completed operations remain committed; batching is sequential and is **not transactional**. The helper rejects malformed batches before execution. Avoid registering unrestricted methods that an authenticated user should not invoke. Benchmark both latency and resource consumption under your deployment's real network and concurrency.


The handler executes the original bounded, validated JSON argument graph.
Every configured `authorizeOperation` callback receives a second, independent
native `JSON.parse` result. Recognized batches additionally receive a third
independent graph for their inner policy calls. Consequently, accidental
mutation of the outer request arguments, a previously approved batch method,
or an inner argument cannot redirect the submitted private operation. Native
JSON parsing retains deeply nested values, negative zero, and own
`__proto__` data properties without a custom clone stack limit.

This intentionally changes the historical ordinary-RPC behavior: a trusted
authorization callback that previously edited its `args` to normalize values
for the private method must now perform normalization in the method itself or
in an explicitly reviewed wrapper. A callback should make an authorization
decision based on the submitted inputs, not change what later executes.
An ordinary RPC with argument-aware policy incurs one additional full JSON
parse; a recognized batch with that policy incurs two. When no
`authorizeOperation` is configured, neither incurs an extra parse. Costs
scale with the bounded request size and require whole-application profiling
against the 2.5× compute limit.

This protects against policy-side argument mutation within one request.
It does not make permission checks atomic with external state, protect
against deliberate privilege grants by trusted callbacks, cancel running
methods or provide an anti-relay mechanism. Native real-HTTP regression
tests are in `test/sco-operation-auth.test.js` and
`test/sco-batch-policy-mutation.test.js`.


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
pure and complete for every state-changing operation. The helper rejects a
Promise or callable thenable returned by a transition (including the final
step) and rejects a thenable initial state; otherwise an unresolved Promise
could be mistaken for a truthy authorized state. An asynchronous transition
must be resolved by the application before calling this synchronous helper.
When an erroneous policy returns a rejecting native Promise, including one
from another VM realm, the helper observes the rejection before throwing its
synchronous TypeError. This prevents a later unhandled rejection from
terminating Node. Real Promises are refused even if their `then` field is
masked. The helper cannot cancel asynchronous side effects already started
by a bad policy. Arbitrary non-Promise thenables remain rejected without
invoking their `then` method. The integrator must
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

The handler invalidates the supplied execution callback once the isolation
wrapper returns or throws. A detached callback invoked later rejects before
private work begins, even if the original HTTP request has already failed.
The [two-platform red/green regression](../im-results/sco-isolation-expired-callback-2026-11-16.md)
demonstrates that original bounded safety property.

The handler also checks that the execution promise has settled before accepting
the isolation wrapper's return. If a faulty wrapper starts `execute()` and
returns while an asynchronous authorization check is pending, the handler
responds with a generic HTTP 500 and invalidates the execution scope.
Continuation after the pending `authorizeRpc`, `authorizeOperation`, or
per-item batch policy check verifies that the scope remains active before
running further policy or protected work. A detached operation's eventual
return value is also blocked from being sent as a successful RPC response.
A wrapper which awaits `execute()` but suppresses its exception cannot leave
the HTTP connection pending without a response. The handler also attaches a
rejection observer to every returned `execute()` promise. If a faulty wrapper
silently discards that promise, delayed scope rejection is observed rather
than becoming a fatal unhandled rejection under Node's strict policy. A
correct wrapper still receives the original promise and must await it.
This guard addresses server availability after misuse of the integration
contract, without suppressing errors for correctly awaiting wrappers.

These guards **cannot cancel private methods already entered**, undo their
effects, or restore a lock that an integrator prematurely released. A correct
integrator must still await `execute()` exactly once and hold the lock or
transaction until the entire operation settles. Tests for detachment across
pending authorization gates are in
[`test/sco-rpc-isolation.test.js`](../test/sco-rpc-isolation.test.js).
The native asynchronous promise lifecycle follows the language's ordinary
`await` and `finally` semantics.

The hook is optional. With the hook unset, existing early coarse
authorization and request behavior remain unchanged. When the hook is
provided, the body is validated and size-bounded before coarse
authorization, so a caller might receive a syntax/size response before
a forbidden response.

An optional **deny-only pre-admission filter**, `admitRpcEarly(request)`,
may be configured alongside `runRpcIsolated`. It must be a synchronous
function returning literal `true` to let the request proceed to bounded
body parsing and the isolation queue. Any other return value is denied
with HTTP 403 and a generic `Forbidden` response; a thrown exception
is collapsed to generic HTTP 500. Promise/thenable returns, including a
later fulfillment with `true`, are denied immediately; any eventual
rejection is observed rather than becoming an unhandled Node rejection.
The filter never waits for asynchronous pre-admission work. Refused requests do not enter the
principal resolver, occupy `maxPendingTotal` capacity or invoke the
protected operation. They also skip the final `authorizeRpc` callback;
applications requiring a denial audit must record it in the prefilter
or an independent front-door logger. The callback is captured once
during handler construction. It deliberately runs before the body is parsed: an
unauthorized malformed JSON request may receive HTTP 403 instead of
HTTP 400. The filter is only available when `runRpcIsolated` is set;
it is opt-in and changes no default policy.

**This filter never grants authorization.** Every request it admits must
still pass the normal `authorizeRpc` check *inside* the isolation scope,
and any configured per-operation authorization remains mandatory.
A stale positive pre-admission decision is therefore insufficient
to bypass a subsequent revocation. Use a cheap, non-mutating,
independently verified authenticator or a trusted admission signal in
`admitRpcEarly`; never use a mere claimed account, unauthenticated
header, caller-supplied principal ID or an in-memory permission snapshot
as proof of identity. Only a trusted server-side component should
supply such a signal. A public key/MAC verification on a bounded token
can be an example, but token freshness, revocation and replay controls
remain application responsibilities. No built-in authentication,
rate-limiting, cross-process capacity or network-level DDoS guarantee
is provided. If a prefilter admits a malicious caller (for example by
trusting a spoofed header), that caller can still consume global
capacity before final authorization, and a malicious *authorized*
caller may saturate the configured queue.

The finite real-HTTP control in
[`test/sco-pre-admission-denial.test.js`](../test/sco-pre-admission-denial.test.js)
shows a stalled unauthorized identity lookup occupying a one-slot
global queue without this filter, and the same denied caller consuming
zero reservations when the filter is enabled. It also tests revocation
within the authoritative scope and the filter's strict-boolean
contract. This is a bounded availability improvement, not enhanced
obfuscation secrecy or evidence of universal 2.5× compute compliance. Unauthorized callers can still send up to
`maxRpcBytes` of body data. Deploy front-door request limits and
timeouts as appropriate. A mutex can serialize calls across request
boundaries, but it is not a general rollback mechanism and does not
prevent unlimited legitimate oracle queries.

### Reusable per-principal isolation helper

`createScoKeyedIsolation(principalOf,{maxPendingPerPrincipal?,maxPendingTotal?,maxPrincipalResolutionMs?,abortPrincipalLookup?})`
provides a small in-process FIFO queue compatible with
`createScoHandler`'s `runRpcIsolated` hook. Each verified principal's
authorization checks and method execution are serialized, while different
principals retain independent queues. A failed operation releases its queue,
and the last completed request removes the idle queue entry. Set a positive
integer `maxPendingPerPrincipal` to cap the total active **plus waiting** RPC
calls for each account. Set `maxPendingTotal` to cap the aggregate across
**all** accounts in the current process. Either cap denies admission before
authorization or private method execution and returns generic HTTP **429**.
Both limits are unlimited by default for existing integrations. A finite
`maxPendingTotal` now reserves a global slot **before** awaiting the
asynchronous identity resolver. This bounds unresolved identity lookups as
well as running and queued operations. In contrast,
`maxPendingPerPrincipal` cannot apply until the principal is resolved.
An optional positive integer `maxPrincipalResolutionMs` (1 through
2,147,483,647 milliseconds) bounds how long the helper awaits an asynchronous
principal resolver. On expiry it returns the same pre-execution HTTP **429**
and frees its global reservation. A late resolver result cannot authorize or
execute the expired operation. Default `Infinity` preserves the original
behavior. The deadline does **not** cancel the resolver's underlying network
request or interrupt synchronous/blocking JavaScript, and timer delivery may
be delayed while the Node event loop is busy. An optional
`abortPrincipalLookup:true` (requiring a finite deadline) passes an
`AbortSignal` as the resolver's second argument and calls `abort()` when the
lookup expires. A cooperating identity provider can use this signal for its
own cancellable I/O; the helper cannot forcibly cancel a noncooperating
Promise or synchronous computation. The additional controller is created
only when cancellation is explicitly enabled. Integrators must still configure
upstream identity-provider timeouts and resource limits.
Request parsing still occurs before either cap and consumes memory and CPU;
deploy front-door request limits, timeouts and suitable body-size caps.

```js
const {createScoHandler,createScoKeyedIsolation}=require('./src');
const runRpcIsolated=createScoKeyedIsolation(async request=>{
  const session=await authenticateRequest(request);
  return session.accountId;
},{maxPendingPerPrincipal:8,maxPendingTotal:512,maxPrincipalResolutionMs:5000});
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

To request best-effort cancellation of provider-side I/O, use a resolver
that accepts `(request,signal)` and passes the signal to its identity-provider
client, then configure `abortPrincipalLookup:true`. Existing one-argument
resolvers remain supported, and cancellation is disabled by default.

This helper protects only calls through the same in-process instance. It
cannot synchronize Node workers, cluster processes, other services, database
writers or permission changes outside this handler. For those deployments
use a shared transactional database or distributed lock with the required
isolation semantics. Long-running operations retain their principal's queue
until settlement; the optional deadline applies only to **principal lookup**,
not queued or running protected work. Do not use the helper recursively for
the same principal. FIFO order is the order of completed identity
resolution and queue registration, not a network arrival guarantee.

An isolator does not make a batch transactionally safe. Continue using
`preflightScoBatchState` or disallow state-changing operations in batches.
See `test/sco-keyed-isolation.test.js` for parallel HTTP revocation and
independent-principal FIFO/failure regressions, and
`test/sco-keyed-capacity.test.js` for bounded-queue and 429/500 classification
regressions, and `test/sco-principal-resolution-deadline.test.js` for expired
and late principal lookups. This is an SCO
server authorization control, not client-side anti-debugging or a proof
of the project's universal 2.5× compute target.

## Limits

The client still receives executable JavaScript and may retain, trace, debug, modify, replay, or redistribute it. Source delivery authorization only controls which requests the trusted SCO server fulfills. Do not put server secrets inside delivered JavaScript, and do not use the `Host` header as an identity proof. Keep sensitive algorithms or secret-dependent operations on the server through `remoteMethods`; account for network cost under the 2.5x runtime budget.

The optional read gate is applied after a file is located and before either the asset bytes or newly obfuscated source is delivered. Authorize all relevant resources and ensure any deployment-level caching is compatible with the intended per-request access controls. In particular, do not permit a publicly shared cache to serve previously authorized responses to unauthenticated clients.
