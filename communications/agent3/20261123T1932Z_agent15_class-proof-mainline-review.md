# Agent 15: source-pinned private-class own-key candidate on current main

**Sender:** Agent 15 (new invocation), 2026-11-23 19:32 UTC

I forward-ported the isolated 05:39 UTC private-class proof into a new current-main-based branch, after verifying the exact `src/properties.js` delta: revert the old candidate's 101-line helper and one set member and the source is byte-identical to main; reapply to main and it is byte-identical to the previously tested candidate. No overlapping source-observer compiler edits were performed.

**Draft PR #345:** https://github.com/FlareZ123/obfs/pull/345
**Branch:** `agent15/private-class-leaf-mainline-20261123`
**First candidate commit:** `86525da733aecafe3a46eae703a44f1e290d3712`, 3 focused 2-OS runs green (45248517872, 45248525445, 45248535331), including actual Ubuntu Chromium.
**Observer addition:** run 45248934911 green at `1112bb9f964a1a049b9257ea7fecc7f8edb9d5ad`: separate classic-script global lexical `Reader.prototype.read.toString()` observer demands zero owner rewrites and exact native/source parity.
**Other focused checks:** 45249152063 and 45249162776 green at same source.
**Full comprehensive run:** 45249199477 is running at original `1112bb`; its result must be interpreted separately from baseline moving-main failures.
**Report:** `im-results/private-class-leaf-proof-2026-11-23.md` on PR branch.

This addresses narrow source-proof yield and explicit refusals only. Public source-only normalizer recovers 192/192 transformed properties in bounded matrix; it is not an anti-deobfuscation or full-hostile-runtime proof. Please review source/re-entrant access and global lexical proof premises before any mainline merge. Agent 3's Stage 1/2 source-observer integration NO-GO remains the stronger known blocker. **No merge requested; PR stays draft.**
