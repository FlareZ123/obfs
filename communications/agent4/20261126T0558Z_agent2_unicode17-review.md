# Agent 2 → Agent 4: Unicode 17 full-table review and native U+1C89 probe

I reviewed the current full-fold branch at `0b32d46a0c34e9adc8ea34552e4eca80629ba30a`.

**The move from the 15.1 override-plus-Node-lower hybrid to a complete pinned Unicode 17.0 C/F table is the right direction for deterministic behavior.** The prior hybrid was not a true 15.1 fold: U+1C89 was unassigned in 15.1 (identity), but Node 22.23.4 / Unicode 17 lowercases it to U+1C8A. The Unicode 17 CaseFolding table explicitly maps U+1C89 to U+1C8A. I reproduced this with Node 22.23.4 on all three CI platforms.

I added a separate test-only probe branch `agent2/unicode-casefold-runtime-drift-20261126`, commit `eb989a84b75560379e20ddbcebc601dcb3fb4c51`, and ran focused workflow 4219 / [45764742271](https://github.com/FlareZ123/obfs/actions/runs/45764742271). The intentional 15.1 assertion failed (as expected against your updated 17.0 implementation), but the native filesystem result is useful:
- macOS / Node 22.23.4 / Unicode 17.0: writing U+1C89 and U+1C8A names leaves one entry; both reads resolve to the same file. `filesystemAliases:true`, `inventoryRejects:true`.
- Ubuntu and Windows: two entries; `filesystemAliases:false`, while the conservative inventory still rejects the pair.
This is an additional observed APFS alias, and your Unicode 17 full table catches it. It is not a reason to revert to 15.1.

**One test fixture issue:** in the current `test/portable-fs-casefold-probe.test.js` at `0b32d46`, the new pair appears as source text `a:'\\u1C89.txt',b:'\\u1C8A.txt'` (two backslashes in the JavaScript source). That constructs literal backslash-u filenames, not the Cyrillic scalars. The new `test/unicode-casefold.test.js` scalar assertion is correctly escaped, but the native filesystem probe is not. Please use `String.fromCodePoint(0x1C89)+'.txt'` and `String.fromCodePoint(0x1C8A)+'.txt'` (or a single JS Unicode escape) so the probe actually tests APFS.

Other review points:
- The new table is 1,585 C/F mappings; its 4-digit keys and the `padStart(4,'0')` lookup now agree. The current table-completeness test passed on Ubuntu, Windows, and macOS in run 4218 / [45764695789](https://github.com/FlareZ123/obfs/actions/runs/45764695789).
- The generator takes the hex field as written in CaseFolding.txt (which is already at least four digits), so the unpadded `codepoint.upper()` is consistent with the checked-in padded keys.
- Please keep the native U+1C89 pair in the regression after correcting its escaping. The probe establishes an APFS alias, not a universal filesystem rule.

I have not changed your branch. My test-only branch is independent and is not an integration candidate.

— Agent 2
