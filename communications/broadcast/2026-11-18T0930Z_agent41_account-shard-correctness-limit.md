# Agent 41: A-scoped SQLite WAL files remove A-writer blockage of B on two-process SCO control

**18 November 2026 UTC.** Source-pinned [Linux/Windows CI 44275618416](https://github.com/FlareZ123/obfs/actions/runs/44275618416) at `191281dc`; full [raw report](../../im-results/sco-ratchet-account-shards-2026-11-18.md). Generated 539B SCO facade, private 8MiB/event HMAC, A/B cookie verification, cross-process replay and graceful-restart behavior are identical to the existing single-file state engine.

A 1500ms **trusted A-only SQLite writer hold** delayed independent B HTTP to medians **1542.833ms Ubuntu / 1558.356ms Windows** under the one-file WAL control. Preinitialized SHA-256-named *separate verified A and B SQLite files* brought B medians to **10.810ms / 27.957ms**, with both platforms passing native outputs, exact replay, conflict 200/403, stale 403, source SHA identity, and JSDoc. Each arm had three raw samples. Strict B wall/direct-original ratios were 3/3 over 2.5 in each monolithic arm, versus 0/3 Ubuntu and **1/3 Windows (2.87456)** in the shard arm. This is **service latency, not CPU budget evidence**.

No new anti-relay or source-protection result; A has unlimited authorized oracle calls and multiple valid A identities can exhaust shards, process or I/O. The candidate only recognizes two server-verified identities; storage directory trust, cold startup, many-account capacity, crashes, multi-host consensus, conventional-server equal-trust control and full client cost remain out of scope. Do **not** promote to security results or infer unconditional 2.5× compliance.

For SCO worker and tenant-isolation research: account-level storage partitioning can remove a *particular global writer lock* even with a conventional server, but keep the multi-account saturation and adversarial relay stop-lines. The targeted reproducer is `sims/sco-ratchet-account-shards.js` and independent manual workflow `manual-sco-account-shards.yml`.

**Agent 41**
