# SCO recognized-batch authorization work before invalid requests

**Status:** bounded trusted-server resource-consumption hardening; source-pinned cross-platform validation pending.

## Problem

The `createScoBatchMethod` executor rejects invalid or oversized input batches before any operation. Previously, `getScoBatchCalls` exposed every structurally shaped item from the caller-supplied array to `createScoHandler`'s per-item `authorizeOperation` callbacks *before* the executor validated its own `maxCalls` bound and registered method names. An authorized caller could submit 256 individually well-shaped operations to a helper capped at two operations and make the server issue 256 potentially expensive database or identity checks, even though the helper must ultimately reject the batch with zero private effects.

The request-body `maxRpcBytes` remains a distinct outer input-size cap; it does not bound the cost of a per-item authorization callback. This counterexample involves a legitimate caller with permission to reach the outer batch method, not a bypass of a correctly implemented method policy.

## Change

`src/rpc-batch.js` now attaches its exact validation predicate to the recognized batch function in a private `WeakMap`. Both actual execution and `getScoBatchCalls` use the same validator, covering nonempty array shape, the batch's own `maxCalls`, registered method identities and per-item argument arrays. When validation fails, the handler has **zero** inner authorization callbacks to invoke; the executor still rejects the batch as `Invalid or oversized RPC batch`, surfaced through HTTP as generic 500. Executable batches continue to authorize every member before private effects.

One real HTTP regression was appended to `test/sco-batch-policy-closure.test.js`. Its invalid controls include 256 calls with `maxCalls:2`, an unknown method in a two-item request, and a malformed argument array; each expects HTTP 500, zero inner-policy calls, and zero private effects. Its positive control sends two registered calls and verifies exactly two inner-policy checks and two private effects plus correct ordered values.

## Compatibility, limits, and performance

On invalid input this changes observable authorization precedence. A former inner-policy 403 can now become a generic batch-validation 500, without any private operation executing. The code does not alter the outer `authorizeRpc` or outer `authorizeOperation` checks; costly outer checks still happen. This prevents an invalid batch from amplifying inner authorization work, with the actual performance gain dependent on callback costs and request shape. No real database, load test, network RTT, process-session profile or universal **2.5×** runtime result is established.

All valid workloads still evaluate an O(batch-size) validation predicate at HTTP preflight and again at execution. The original helper already validated at execution, so the preflight is additional work for admitted batches. Profiling is needed before concluding the change has a favorable full-session performance tradeoff on supported valid workloads. Server-held logic, client/source reconstruction resistance and attacker relays are unaffected.

Files: `src/rpc-batch.js`, `src/sco.js` (unchanged for this patch), `test/sco-batch-policy-closure.test.js`, `docs/SCO_AUTHORIZATION.md`; manually triggered `.github/workflows/manual-sco-authorization.yml` covers the HTTP regression.
