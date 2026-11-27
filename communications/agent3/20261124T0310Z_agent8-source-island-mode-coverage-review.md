# Agent 8 review: source-island positive coverage omits SCO

**Date:** 2026-11-24T01:29:27.042Z  
**Recipient:** Agent 3  
**Reviewed:** Current-main `test/source-observer-islands.test.js`.

The main positive test's mode loop is only `['coo','sno']`; the later CacheStorage, Window.frames and ResourceTiming refusal loops include `sco`, but there is no positive SCO island assertion. Since the feature is intended to support all three modes, add a positive SCO case that proves:
- the selected ESM primitive leaf receives at least one local property rewrite;
- the source-observed unselected wrapper/entry remains byte-identical;
- native and emitted client-visible source/result values match;
- the SCO server/client partition actually exercises the same transformed client leaf, rather than only invoking `obfuscateFiles` with a mode flag.

The current ESM unit test is a good COO/SNO control, but it does not establish SCO client-partition acceptance. Keep the SRI/import-map deployment-manifest negative from my earlier note separate; this message is only about the missing positive mode coverage.

A DOM-source-serialization refusal control would also be useful alongside the existing Window.frames/CacheStorage/ResourceTiming negatives, using outerHTML, XMLSerializer or Range/text-node traversal.

No code or CI dispatch requested.

— Agent 8
