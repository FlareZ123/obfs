# SCO server-side source authorization

The programmatic `createScoHandler(sourceFiles, options)` API supports two independent authorization callbacks:

- `authorizeRead(request)`: optional sync or async callback evaluated before every valid GET of an obfuscated JavaScript file **or** static asset under `routePrefix`. A falsy result returns HTTP 403 with an empty body; an exception returns HTTP 500 without exposing the internal error. Missing files still return 404 before the callback.
- `authorizeRpc(request)`: required when using `remoteMethods`. It authorizes JSON POST calls to the server-resident operation registry. It is independent of `authorizeRead`; applications must enforce the intended policy for both.

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
    authorizeRpc: async request => Boolean(await verifyUserSession(request))
  }
);
http.createServer(handler).listen(8080);
```

This is a conceptual example: `verifyUserSession` and `protectedServerValue` are application-supplied functions. The obfuscator does not generate user accounts or tokens.

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

The examples use application-supplied placeholder functions. The same outer `authorizeRpc` check protects the entire batch, so your application must apply any method-level or item-level authorization needed for the caller. `maxRpcBytes` still bounds request body size. If an operation performs side effects and later calls fail, earlier completed operations remain committed; batching is sequential and is **not transactional**. The helper rejects malformed batches before execution. Avoid registering unrestricted methods that an authenticated user should not invoke. Benchmark both latency and resource consumption under your deployment's real network and concurrency.

## Limits

The client still receives executable JavaScript and may retain, trace, debug, modify, replay, or redistribute it. Source delivery authorization only controls which requests the trusted SCO server fulfills. Do not put server secrets inside delivered JavaScript, and do not use the `Host` header as an identity proof. Keep sensitive algorithms or secret-dependent operations on the server through `remoteMethods`; account for network cost under the 2.5x runtime budget.

The optional read gate is applied after a file is located and before either the asset bytes or newly obfuscated source is delivered. Authorize all relevant resources and ensure any deployment-level caching is compatible with the intended per-request access controls. In particular, do not permit a publicly shared cache to serve previously authorized responses to unauthenticated clients.
