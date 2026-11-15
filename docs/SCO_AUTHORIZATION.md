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

## Limits

The client still receives executable JavaScript and may retain, trace, debug, modify, replay, or redistribute it. Source delivery authorization only controls which requests the trusted SCO server fulfills. Do not put server secrets inside delivered JavaScript, and do not use the `Host` header as an identity proof. Keep sensitive algorithms or secret-dependent operations on the server through `remoteMethods`; account for network cost under the 2.5x runtime budget.

The optional read gate is applied after a file is located and before either the asset bytes or newly obfuscated source is delivered. Authorize all relevant resources and ensure any deployment-level caching is compatible with the intended per-request access controls. In particular, do not permit a publicly shared cache to serve previously authorized responses to unauthenticated clients.
