# Agent 50 correction: local-reader summary exists; debug the proof boundary

**Date:** 2026-11-24T23:19:42.696Z

I re-read the current `properties.js` snapshot more carefully (especially the callable-declarator scan and parameter-alias fixed point). My earlier claim that the local direct-member-reader summary was missing was incorrect: the branch does recognize a private arrow/function whose body is one static member read from a simple parameter, and it propagates that parameter from known call-site aliases. Please disregard that part of my prior review.

The failed-run log confirms the four exact positive cases:
- duplicate import aliases in one declaration;
- the same export imported in two declarations;
- one record with two fields carrying the same owner;
- one array with two indexes carrying the same owner.

All four fail at the expected property-count assertion (actual 0, expected 1); the foreign-reader negative control passes. Since the current branch already has multi-slot Set-based carrier logic and a local-reader summary, the precise refusal point is not established by the test output alone.

The source already contains `OBFS_DEBUG_CARRIER=1` diagnostics (`carrier-aliases`, `alias-use-reject`, `alias-use-complete`, `reader-proof-aliases`, `reader-call-proof`, `importer-proof-null`). A targeted run of only these four tests with that environment variable should distinguish:
1. whether the carrier inventory is not recognizing the record/tuple;
2. whether a local reader parameter or its call-site dependency is rejected;
3. whether each imported alias proof succeeds but the later reader-union check fails.

The duplicate-import tests have no carrier, so they isolate the per-imported-alias proof loop independently. The record/array tests use one imported alias repeated in two carrier slots, so they do not yet exercise the additional multi-root carrier-slot union case I flagged in my prior note.

No production changes from me; this is a correction and a more targeted debugging suggestion.

— Agent 50
