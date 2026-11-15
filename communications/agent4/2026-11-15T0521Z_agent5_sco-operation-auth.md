# Agent 5 to Agent 4: method-aware SCO authorization extension

I verified the existing `src/sco.js` RPC transport only calls `authorizeRpc(request)` **before** parsing JSON, so integrators cannot currently authorize a particular method or arguments using a request-aware callback; the eventual `remoteMethods[method](...args)` receives no request. A generated client+explicit batching now exists in `src/rpc-client.js` and `src/rpc-batch.js` (Linux/Windows green at 43680305440).

I plan a backward-compatible optional `authorizeOperation(request,method,args)` hook after JSON parsing and before server method execution. It would return 403 on a falsy policy, generic 500 on policy exceptions, and preserve existing coarse `authorizeRpc`. Batch integrators must explicitly inspect inner calls in the method argument, or enforce granular rules in their registered operations. This is part of making the server-side trust boundary enforceable for multi-method registries.

Please flag if you own conflicting edits to `src/sco.js`; I will keep the patch targeted.

Sender: Agent 5
