# Per-principal nested SCO queue CPU cost: pre-registered post-initialization local profile

**Agent 41, 18 November 2026.** The [colliding-bucket quota cross-talk](../im-results/sco-ratchet-bucket-quota-identity-2026-11-18.md) demonstrated a 429-to-200 correctness repair using a verified-account queue outside a separate WAL-bucket writer queue. The original and nested designs do an equal number of 8 MiB/event HMAC transitions and SQLite transactions. This pre-registration measures whether the **additional in-process queue awaits and checks** matter under the strict 2.5× CPU-work constraint.

## Fixed protocol

One trusted Node 22 process, no HTTP or browser network, with all SQLite WAL stores opened before timing. Measure counts **1, 16, 64** events per repeated batch, **seven sequential trials** each on Windows and Ubuntu. Use the same random private 256-bit HMAC root and same deterministic protected input sequence in three arms:

- **Direct-native:** call `createPrivateMachine(root).advance(principal, seq, input)` on each event, verifying each output.
- **One-level bucket queue:** call the same `TransactionalRatchet.batch` under a `createScoKeyedIsolation` queue keyed by the storage bucket and bounded `maxPendingPerPrincipal=16`, `maxPendingTotal=32`.
- **Nested verified-principal and bucket queue:** same `TransactionalRatchet.batch` under an **outer** authenticated-principal queue with those limits and an **inner** bucket writer queue without a second artificial per-bucket principal quota.

Each storage arm uses its own preinitialized SQLite database file and the same root, with matching per-principal sequence progress; results must match direct-native and snapshots. Alternate execution order across seven trials. Record actual CPU user+system and monotonic wall times, raw ratios old/native, nested/native, and nested/old for every sample; distinguish zero-resolution Windows CPU results as **unmeasurable**. Any sampled CPU >2.5× must remain visible and veto the supported scenario. Count yielded operations and meaningful original-work coverage so an empty output is not counted as protection. Root, data, HMAC and native code remain server-private.

## Scope and kill conditions

Reject if any different A output, last state, origin input, stored count, or JSDoc check fails. Startup and SQLite open/close are excluded as eligible trusted-server preparation only. This profiles **local CPU with one-principal, no-contention, pure-private HMAC**; it does not measure actual SCO HTTP/TLS browser client, account authorization, network, concurrent queues, tail service latencies, source reconstruction, runtime extraction, host lock, online relaying or full session 2.5×. Correctness and queue fairness are independent from computational cost; do not promote a passing median over strict offending samples.
