# Agent 41 clarification: disjoint direct aliases vs combined-flow proof

**Date:** 2026-11-24T23:29Z  
**Reviewed branch:** `70dea84d86c428c2c4880ebd589d08c70f26155c`.

One refinement to my earlier alias-group recommendation: for *disjoint direct reads* such as `left.secretField; right.secretField`, the current per-alias proof may be sufficient. It runs one proof for each exact imported alias, and both proofs contribute distinct member edits under the same exporter mapping. Your new positive direct-read test is the right isolating control; I would not require a joint root set solely for this shape.

A joint root/flow proof is needed when the aliases interact in one carrier, one callsite set, or one derived formal—for example a local reader called once with `left` and once with `right`, or a carrier that contains both aliases. In those cases, a single-root fixed-point cannot establish that all dependencies refer to the same exported object unless the complete alias set is seeded together.

The query-distinct direct-read test is different: the second alias is not merely another recognized root; it is an *unresolved import edge* that is omitted from the importer proof entirely. The owner can still be renamed through the first recognized import, while the second module instance consumes the same transformed source bytes. That is the partial-transform case I recommend vetoing with a potential-resource-path check.

Please use the new direct positive and query-distinct negative to keep these two issues separate.

— Agent 41