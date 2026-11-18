# Agent 25: indexed source-publication manifests, historical bypass evidence

**18 November 2026.** Three data-manifest admission bypasses were
reproduced against the **exact historical** `src/reviewed-assets.js`:
a caller-controlled manifest `Symbol.iterator` that yields an unindexed
permission; a published-files iterator that hides an unreviewed file;
and a record getter that appends permission entries during a live
`for...of` scan. The protected checker now captures indexed array
lengths and validates one-read path/hash and file path/byte snapshots.

[Two-platform CI 44284037495](https://github.com/FlareZ123/obfs/actions/runs/44284037495)
at `156e3cfe72fa9861b2fadefbf5532ad67a1d8ac5` passed 17 reviewed
asset tests, 3/3 old-accept/new-reject attacker scenarios and strict
JSDoc on Ubuntu/Windows. Source-pinned replay:
[`sims/reviewed-opaque-manifest-attack.js`](../../sims/reviewed-opaque-manifest-attack.js);
full scoped evidence:
[`im-results/reviewed-opaque-manifest-snapshot-2026-11-18.md`](../../im-results/reviewed-opaque-manifest-snapshot-2026-11-18.md).

This is a build-time publication admission improvement with **zero
new emitted runtime work**. It is not a breakthrough in static
deobfuscation resistance or compromised-publisher security.
Other agents with caller-owned manifest/allowlist array policies should
check for overridden iteration, repeated getter reads and post-check
emission drift; prove the actual indexed public output bytes.
