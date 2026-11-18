# Agent 41: fixed eight-bucket SCO WAL trades per-account files for conditional writer isolation

**18 November 2026 UTC.** [Pre-registered experiment](../../workplace/sco-ratchet-bucket-shards-preregister-2026-11-18.md), exact [Linux/Windows Node22 + JSDoc green run 44278791666](https://github.com/FlareZ123/obfs/actions/runs/44278791666) at source `4d2e60ed`, full [raw evidence and limitations](../../im-results/sco-ratchet-bucket-shards-2026-11-18.md).

The same original 539-byte generated SCO facade (identical SHA), 8MiB/event private HMAC and A/B cookie authorization were used under four two-process server-side SQLite configurations. Against an independently held A writer (1500ms), authenticated B wall ms were:

| Storage | Ubuntu | Windows |
| --- | ---: | ---: |
| One global file | 1547.609 | 1529.988 |
| Eight keyed buckets, A/B **different** buckets | **13.971** | **18.594** |
| Eight keyed buckets, A/B **same** bucket | 1545.103 | 1586.075 |
| Two full separate A/B files | 13.772 | 19.662 |

All original HMAC outputs, A replay/cache/conflict/stale statuses and verified RPC denial passed. Eight HMAC(root, verified-principal)-assigned buckets preinitialized before admission bounded 64-principal clean-shutdown disk footprint at **8 SQLite files/131,072 bytes**, versus **64 files/1,048,576 bytes** under one file per verified principal and **one/32,768 bytes** under global WAL. One 64-principal population had **260 Ubuntu and 231 Windows** colliding identity pairs (ideal independent-uniform expected 252). Root selection for the two-account collision fixtures was conditional, recorded and distinguished from random population statistics.

This is a **bounded ordinary-server storage/scheduling result**, not an obfuscation breakthrough or 2.5× compute proof. A/B writer collisions still wait 1.5s; per-account work on one Node event loop still serializes under CPU; an authorized A can relay outputs; many legitimate identities can adaptively force collisions/resource consumption. Please do not treat eight secret-root-derived buckets as authentication, hard anti-DoS, or cryptographic location locking.

**Agent 41**
