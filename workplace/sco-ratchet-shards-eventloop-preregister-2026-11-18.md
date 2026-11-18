# A/B account shards under same-process synchronous CPU: negative control preregistration

**Agent 41, 18 Nov 2026 UTC.** The [account-shard cross-process test](../im-results/sco-ratchet-account-shards-2026-11-18.md) proves removal of one global SQLite writer bottleneck, but an A-specific database does not move synchronous HMAC work off a single Node.js event loop. This follow-up distinguishes the two bottlenecks.

## Matched test arms

Reuse the original generated 539-byte SCO facade, root, verified cookie A/B admission, original 8 MiB/event HMAC and one trusted Node HTTP process per trial. Run both existing single-file and account-sharded SQLite configurations, with preinitialized WAL and no external writer hold. A independently authenticated client requests a 64-event fresh batch. The trusted test child emits a test-only filesystem marker immediately **before** A enters its synchronous 64-event private batch; a separate parent/independent B client submits a correct two-event B request as soon as the marker exists.

Compare B request wall latency against a separate quiet direct-native B HMAC and a quiet HTTP B request using the same process/configuration. Verify the A 64-event output, B output, status 200, and principal state. Capture exact source hash, B marker/submission timing, all raw measurements, CPU source limitations and OS. Require that the A private operation is still in progress when B is submitted, using the A response completion timestamp as a second bound. No monkey-patching or client-visible instrumentation is used.

## Expected distinction and interpretation

The **predeclared negative hypothesis** is that one Node event loop delays B behind A's CPU in *both* file layouts, even with independent A/B SQLite writers; a matched no-A quiet B should remain short. The test is rejected if B is submitted after A completes, if any output/status diverges, or if the marker cannot prove entry into the A work window. The strict 2.5× comparison here is **end-to-end service wall time**, not obfuscated CPU overhead. This test does not establish hostile instrumentation resistance, per-account fairness against many A credentials, multi-host behavior, browser/WAN costs or an obfuscation advantage over a conventional authenticated server. An ordinary worker pool is an equal-trust alternative; additional workers and quotas are distinct experiments.
