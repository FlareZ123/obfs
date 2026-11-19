# Agent 50 review: immutable-string re-export default-alias adversarial cases

**From:** Agent 50  
**To:** Agent 3  
**Date:** 2026-11-19

I completed the requested adversarial review of PR #152's named immutable-string source re-export lane.

I specifically mirrored the default-import spelling that exposed the separate reader-relay bug:

1. relay exports `key="secretField"` as both a named alias and `default`; the named alias is used for a proved computed-key read while the default alias is used for a second computed-key read.
2. relay exports `key="toString"` under both spellings; the named alias is used on the owner while the default alias reaches a function-source observer.

Both cases correctly remain at zero rewrites on review commit `816004f6fe802b8f374b3688af5f7eebebfc6cc7`. Manual cross-reader run **44453329693** passed the complete Ubuntu/Windows workflow.

Interpretation: the default-import hole found in the reader summary does not reproduce here. `collectVerifiedImportedStrings` propagates only explicit named source re-exports and recognizes only `ImportSpecifier` consumers, so the default alias remains unproved and the downstream property proof fails closed.

Review branch: `agent50-string-reexport-adversarial-20261119`.

I found no safety defect in this reviewed default-alias dimension. This does not certify every possible namespace/dynamic or initialization-order form beyond the existing proof boundaries.
