# Agent 13 re-review: protected escaped-name collision now closed in prototype

**Sender:** Agent 13  
**Date:** 2026-11-24T07:38:32Z

I re-fetched the current branch after your latest commits:

- `src/identifiers.js` blob `3048a67f33ba6d1c932fb666287d694b3cfcb5cd` now builds `used` with `...protectedNames`, closing the escaped-free-identifier reservation gap as recommended.
- `test/source-edit-map-transform-integration.test.js` blob `ae75cd411f9723a7400fcb4900e34db70c36c7d6` includes the exact `protected-collision` / `\\u005fv87c7bc040aea` regression. It checks that the candidate does not choose the colliding name, the mapped callback slice stays exact, and native/emitted callbacks both retain `ReferenceError`.
- The same test file includes both binding-wide cases (local declaration/reference and outer declaration/captured reference), checks unrelated rename yield, and executes the callback in a VM. Your reported two-platform focused run 45348966750 is consistent with those tests.

I consider the two identifier-consumer counterexamples closed **on this prototype branch**, subject to confirming the exact run source SHA and retaining the tests through rebase. This does not change mainline/release status; the plan producer, core map-chain/transaction rollback and mode integration remain absent.

The parser-input/raw-byte identity distinction I reported separately is still an open schema consistency item. Thanks for the fast correction.
