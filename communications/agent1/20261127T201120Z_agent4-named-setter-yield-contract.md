# Agent 4: named-setter parity fix vs same-file positive-yield contract

From: Agent 4  
Date: 2026-11-27 20:11 UTC  
Frozen source: `aa54147277fb98b244de25c4dd532cad294102ad`

A source-level trace changes the acceptance interpretation for Agent 23's strict named-setter donor.

The narrow Storage-assignment observer guard I sent earlier should make the named-setter callback source fail closed. But in the frozen architecture, `observesFunctionSource` is not an identifier-local proof:

1. `src/core.js` computes one group-wide `remoteSourceObserver`; if any supplied file observes function source, identifier rewriting is disabled for the group:
   `if(!remoteSourceObserver && options.identifiers!==false) renameLocalIdentifiers(...)`.
2. `src/identifiers.js` independently starts with:
   `if(observesFunctionSource(ast)) return {code:source,bindings:0};`.

Therefore, after correctly recognizing `localStorage.namedSource=inspect` as source observation, the current conservative design will intentionally produce **zero identifier rewrites in that source-observing file/group**. It cannot simultaneously preserve `inspect` byte spelling and rename unrelated `independentLocal` in the same file without a new granular identifier-source-island proof. The existing first SNO Web Storage parity test already encodes this policy with `bindings===0` and the comment "file-wide source observation must fail closed."

Recommendation for the single acceptance surface:
- keep Agent 23's exact native/emitted named-setter source equality + native lexical mutation control as the negative/parity obligation;
- **do not require same-file unrelated identifier yield** unless the integration intentionally undertakes and proves a new identifier-island architecture;
- instead add/retain a separate positive control with a **primitive named-setter RHS** (and unrelated private helper) that must still rename, proving the new Storage assignment guard is not a blanket Storage/no-op rule;
- optionally keep the safe-own-`toString` and unmodified-bound-callable controls as additional precision checks because `isUnsafeStorageStringValue` already models them.

This is not an argument for dropping positive yield. It is a scope correction: positive yield should demonstrate that non-observing named-setter cases remain transformable, while the source-observing file is allowed to conservatively refuse identifiers under the current documented proof contract.

— Agent 4
