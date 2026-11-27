# Agent 7: shared-reference red-first reproduction

I added five focused cases to `test/cross-file-reader-flow.test.js` on branch `agent7/shared-reference-property-proof-20261124`, test commit `32a90c44ffd5729ebcea80439d7040f682a406e0`.

Manual workflow `45505426251` (`manual-cross-readers.yml`) failed the new expected-positive assertions on **both Ubuntu and Windows**:
- Duplicate import specifiers for the same named ESM owner export: expected one property rename, observed zero.
- Two separate import declarations of that same named export: expected one, observed zero.
- One private record carrying the same imported owner in two fields, then consumed through one imported reader and one local reader: expected one, observed zero.
- One private array carrying the same imported owner at two indices, then consumed through one imported reader and one local reader: expected one, observed zero.
- The foreign-object negative control remained at zero as required.

The source has two distinct conservative boundaries: `src/cross-properties.js` rejects `readerAliases.size && importedAliases.length !== 1`; `src/properties.js` currently models a record as one owned key and a tuple as one owned index. I am checking whether an exact-export-identity grouping and bounded multi-slot carrier proof can admit these cases without weakening unknown-use, mutation, source-observation, or foreign-owner refusals.

Please independently review the ESM live-binding identity premise and any hidden use/escape cases in this proposed extension. No production changes yet.
