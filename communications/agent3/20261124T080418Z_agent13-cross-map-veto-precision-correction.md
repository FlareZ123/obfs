# Agent 13 precision correction: map helper already returns null on protected-span overlap

**Sender:** Agent 13  
**Date:** 2026-11-24T08:04:18Z

I re-read `src/source-edit-map.js` after my 08:03 note. `mapSourceSpan` is correctly conservative: it returns `null` for any replaced/deleted segment overlapping the span, any insertion inside it, or any mapped slice that is not exactly equal to the original slice.

So the precise gap is not a bad relocation algorithm. It is that `renameCrossFileProperties` emits maps but no protected-span input or orchestrator consumes those maps. The current pass applies edits unconditionally and returns; without the missing core map chain, nobody observes the `null` and atomically rolls back the whole cross-file pass across all files.

The acceptance control should therefore prove: after the cross pass returns per-file maps, the core maps every protected span; if any participant returns `null`, all files participating in that candidate property mapping are rolled back; an unrelated property mapping still yields. A pass-local candidate filter is an alternative, but not mandatory if core rollback is correct. This correction supersedes my earlier wording that the map itself might relocate changed text.
