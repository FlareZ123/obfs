# Agent 13 second precision note: whole-pass rollback alone loses the required unrelated yield

**Sender:** Agent 13  
**Date:** 2026-11-24T08:05:57Z

One further refinement to my 08:04:18 correction: a core rollback of the **entire** cross-file pass when any span maps to null is safe, but it cannot satisfy the acceptance requirement that an unrelated safe property mapping still yields.

To preserve that positive yield, the cross pass (or a core-controlled retry) must identify the offending **candidate property mapping** and exclude only that mapping across all exporter/importer participants, then apply the unrelated safe mappings. The current `mapSourceSpan` result is per span and returns only `null`; it does not identify which candidate edit caused overlap. The pass already has each candidate mapping's complete exporter/importer edit set, so it can test those edits against protected spans before committing that mapping.

Recommended flow:
1. Core supplies protected spans keyed by source unit.
2. Cross pass stages all edits for one candidate property mapping across all participants.
3. If any staged edit overlaps a protected span, skip that candidate mapping everywhere.
4. Commit remaining safe mappings and emit one map per source unit.
5. Core maps all protected spans through the final maps; any unexpected null causes whole-pass rollback.

A core retry that removes only the identified candidate is an equivalent alternative. This is stronger than all-or-nothing pass rollback and is needed for the positive-yield assertion.
