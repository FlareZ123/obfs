# SCO ratchet: shared transactional state repair preregistration

**Agent 41, 18 November 2026.** Registered after the source-pinned negative two-replica HTTP counterexample and before construction of this candidate. This is a separate **trusted-server state-store prototype** with no claim of distributed SQL availability, adversarial resistance beyond the specified admission sequence, or production SCO deployment.

## Threat, state and proposed mechanism

Two genuine trusted Node.js 22 workers/replicas share a file-backed SQLite database on one trusted host, a 256-bit secret root, and a verified principal identifier. An A attacker possesses an authentic A session and may replay, modify or reorder valid 64-byte hex challenge arguments against either worker. The A credential holder may still relay all A outputs online; no B credential is available. The state store persists one per-principal `seq`, 32-byte HMAC ratchet state, a last-batch SHA-256 input digest and corresponding output array.

Use Node's builtin experimental `node:sqlite` `DatabaseSync` (available on the test Node 22.23.x runners), `BEGIN IMMEDIATE` to serialize competing writers, and a transaction covering both the original 8 MiB HMAC work and state update. The database uses full synchronous journaling and WAL and is closed/reopened between recovery phases. The on-disk database is trusted, not served to the client. A successful batch commits before its result is returned. An identical retry of only the last batch returns cached outputs, while modified, out-of-order, and older batches decline.

The intended guarantee is **at most one committed transition per sequence across workers sharing one functioning database**. An uncommitted private calculation can repeat after a crash; the prototype must not claim exactly-once execution of non-idempotent external side effects.

## Precommitted positive and negative controls

1. Original native HMAC transition output parity holds for fresh batches of 1, 2, 16 and 64 events.
2. Two separately opened SQLite connections pointed at the *same* path admit `seq=0` fresh once, then exact duplicate as cache hit with no new committed events; a changed same-sequence batch must fail. When the next sequence commits, an old batch is denied.
3. After closing every SQLite connection and reopening the same path with the same root, the last batch can be recovered from cache, while the original `seq=0` cannot advance twice. A different private root for that file must be rejected by the startup binding check.
4. Independent account B keeps a different state/output; account A's sequence and cache operations cannot yield B's outputs.
5. Launch two **independent Node child processes** concurrently against one file, both with the same A verified identity and exact same pending batch: exactly one reports `fresh` and one `cached`, with two protected HMAC events committed. Repeat with different inputs at the same sequence: exactly one `fresh`, one `denied`.
6. Seven paired native and storage calls for counts 1,16,64 must preserve original outputs, record individual post-initialization CPU/wall ratios and strict >2.5x pair counts. The public HTTP/client overhead is excluded and must not be conflated with this storage-only measurement; a failed strict pair vetoes its measured workload.

## Limitations and rejection criteria

A single server-local SQLite file is neither a multi-host consensus store nor a substitute for cross-region transactional replication. SQLite's write lock serializes **all accounts**, potentially worsening B service latency during an A HMAC burst. Concurrent private work takes place while the transaction lock is held; writers may timeout under heavy load. Machine crashes, power-loss durability guarantees for arbitrary filesystems, failover, queue fairness, client permission logic and HTTP response loss are outside this prototype. The native SQLite module remains experimental.

Reject the prototype as a corrective demonstration if it permits two fresh commits for the same sequence or cross-account reuse, changes original outputs, re-admits a modified stale batch, fails to bind the database to its root, or fails strict JSDoc. Do not promote it as a production fix before real HTTP integration, crash injection, cross-process timing and denial-of-service evaluations.
