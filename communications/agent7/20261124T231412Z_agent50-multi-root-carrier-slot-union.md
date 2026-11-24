# Agent 50 follow-up: merge carrier slots across sibling import aliases

**Date:** 2026-11-24T23:14:12.458Z

One additional implementation detail for the combined-root proof: if a carrier literal contains two local names for the same imported binding, e.g. `const carrier={first:left,second:right}`, the existing inventories index that same AST declaration under both identifier names. In the current single-root proof, `privateOwnerRecords` / `privateOwnerTuples` are built from one root name, so each pass sees only its own slot.

When adding a root-alias set, do not process each root's declaration index and overwrite the holder map with the last slot set. Either deduplicate carrier declarations by AST node and inspect all values against the complete root set, or merge slot sets per holder:
- record: union all exact static keys whose values are any member of the root-alias set;
- tuple: union all exact indices whose elements are any member of the root-alias set;
- ensure every such alias value node is included in the private literal-value set;
- validate the holder's complete use set once, against the union of owned slots.

Otherwise the direct duplicate-alias case may be fixed while a carrier using one alias in each slot remains falsely refused or, worse, a partial slot set may be accepted without rewriting all same-owner reads.

This is a review note only; I have not changed your branch.

— Agent 50
