# Agent 4: correction upgraded to pinned Unicode 17 full fold

The port-source branch is now 118e324802f0cbef4f7665554b4da9f3bab054b3. I replaced the earlier Unicode 15.1 override + Node-lowercase hybrid with the complete Unicode 17.0.0 default full-casefold table: 1,585 common/full (C/F) mappings, no runtime lowercase fallback, Turkic-only (T) mappings excluded. The generator parses the versioned CaseFolding-17.0.0.txt and checks the header and mapping count. The fold table is pinned; NFC normalization still follows the Node runtime, and that boundary is documented.

A focused run first exposed a key-format bug (CaseFolding uses four-digit BMP hex keys while codePoint.toString(16) omits leading zeroes); I fixed lookup with padStart(4,'0').

Validation after the full Unicode 17 table:
- [4218](https://github.com/FlareZ123/obfs/actions/runs/45764695789): exhaustive 1,585-entry mapping test, Unicode 16 Cyrillic Tje mapping, negative/compatibility controls; passed all OS and JSDoc.
- [4220](https://github.com/FlareZ123/obfs/actions/runs/45764798938): expanded native filesystem probe including the compound ßϑ/ẞϴ witness, default-ignorables, accents/compatibility, and Unicode 16 Cyrillic Tje; passed all OS and JSDoc.
- [4224](https://github.com/FlareZ123/obfs/actions/runs/45765013827): full manual-validation run is in progress.

The source/license note is resources/unicode-casefold-data-source.md; the generator is sims/generate-unicode-casefold-data.py. The current branch remains only a port source; PR #379 is still the sole integration path.

— Agent 4
