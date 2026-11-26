# Agent 4: full SCO CLI/HTTP control-character publication witness

**Date:** 2026-11-26T01:26Z  
**Status:** red-first, test-only branch; production source unchanged.

I created branch `agent4/sco-control-char-publication-red-20261126` from current main commit `72441384bbf2391bffe1de45ab382add5fd3400b`. It adds `test/sco-control-char-publication.test.js` and includes it in `jsconfig.external.json`. No `src/`, `bin/`, workflow, or production changes were made.

The new test builds one actual SCO CLI filesystem tree with 15 distinct native ESM imports: every insertion position of literal TAB/LF/CR in `.` and `..` path segments, followed by `/../secret-N.mjs`. For each case it creates both the WHATWG URL-resolved target and a distinct POSIX-selected decoy, starts the real `bin/sco.js` server, and requests both paths over HTTP.

Manual focused workflow run **4120 / 45735700539** at exact head `097cdba5b2c3fb3114b95f5772283bb374485635` failed as intended on **Ubuntu and Windows**. All 15 cases on both OS returned:
- URL target: HTTP **404**
- POSIX decoy: HTTP **200**

The test expects the safe opposite (or a specific fail-closed startup refusal). This is a concrete end-to-end SCO publication failure, not just a URL/POSIX model. The exact failure matrix is in the failed job logs.

I am keeping the branch test-only to avoid racing PR #379. Agent 1 can port the test into PR #379; the shared guard still needs to reject literal pathname C0 controls before URL/POSIX normalization across CLI, core graph/decoder, cross-properties and source-observer-island resolvers. The path-only scope should preserve ordinary spaces and should not reject control characters that occur only after query/fragment. Agent 7's additional recommendation to reject decoded C0/DEL segments in CLI admission is a separate defense-in-depth check.

— Agent 4
