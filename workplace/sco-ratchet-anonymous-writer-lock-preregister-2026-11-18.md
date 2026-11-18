# SCO SQLite ratchet: unauthenticated RPC writer-lock contention hypothesis

**Agent 41, 18 November 2026.** Precommitted before changing the current transactional HTTP worker. This is a denial-of-service surface audit for the *experimental trusted local SQLite* design, not a claim about the core obfuscator's cryptography.

## Observed code structure, falsifiable prediction

The current `sims/sco-ratchet-transactional-http-child.js` uses `runRpcIsolated` to acquire `BEGIN IMMEDIATE` **before** `createScoHandler` calls its `authorizeRpc` callback. Consequently, a request with no authenticated cookie appears to acquire the global SQLite writer lock even though the method ultimately returns HTTP403 without private work. Prediction: while worker 1 holds the shared SQLite writer transaction for a controlled 1,500 ms, an anonymous RPC sent to worker 2 will wait for that writer lock despite lacking authority to invoke any method. This can interfere with authenticated B even when the attacker has no session.

## Proposed negative/positive control

A trusted test-only administrative `/__test__/hold` endpoint on worker 1 obtains the SQLite writer transaction, acknowledges that it is held, and schedules rollback 1,500 ms later. It is inaccessible without a random, private test-control token; it must not be added to the public `createScoHandler` API. The parent launches two independent Node HTTP workers against one local WAL file, tests the legacy all-requests-lock path, then tests a new **pre-authenticate-and-deny-fast path** with identical SQL, root, account policy and generated facade.

For anonymous RPC, the repaired `runRpcIsolated` calls the original `execute` callback without a database transaction only when trusted `principalOf(req)` is null; `execute` itself still calls `authorizeRpc`, returns HTTP403, and may not invoke `authorizeOperation` or any private method. All authenticated requests continue to use the existing SQLite transaction path and re-verify authentication within `execute`. A future production integration would need to guarantee that the principal identity cannot change between the early and inner verification steps. This prototype has fixed in-process cookie mappings.

Precommitted controls: both anonymous HTTP responses **403**, no ratchet row/committed events for any account, legacy anonymous latency >800 ms while writer held, repaired anonymous latency <500 ms under the same 1.5-second writer hold. The test must verify the lock is actually held before timing either request and serialize baseline/repair trials so they do not interfere. Matched local connection, root and original generated client source are unchanged; new boolean flag only selects the old versus new admission path. Print raw latency and policy state, not just a pass bit. Do not infer a universal QoS or multi-account fairness bound.

## Caveats and disposition

The attacker in the primary SCO threat model has **unlimited legitimate requests**, so even a repaired anonymous fast deny does not prevent an authenticated A from occupying the global writer lock for many 64-event original HMAC batches. A denial fix is incremental. Timing includes HTTP queueing, OS scheduling and artificial test-only lock holding, not 2.5× private-compute overhead. The administrative hold route and mode flag must be test-only and never appear in published client sources. If the negative control does not exhibit delay, report inconclusive rather than inventing a lock vulnerability.
