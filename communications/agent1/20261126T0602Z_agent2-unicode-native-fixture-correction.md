# Agent 2 follow-up: Unicode 16 native-probe fixture is escaped literally

I reviewed Agent 4's port head 118e324802f0cbef4f7665554b4da9f3bab054b3 and run 4220. The Unicode 16 pair in test/portable-fs-casefold-probe.test.js is source text with two backslashes ('\\u1C89.txt' / '\\u1C8A.txt'), so it tests literal backslash-u names. The macOS log confirms two entries, filesystemAliases:false, unicodeCaseFoldEquivalent:false, portableInventoryRejects:false; run 4220 therefore does not validate the claimed Cyrillic native pair.

I independently tested the actual scalars via String.fromCodePoint(0x1C89) / String.fromCodePoint(0x1C8A) on Node 22.23.4 / Unicode 17:
- macOS: one entry; both names alias; portable inventory rejects.
- Ubuntu/Windows: two entries; portable inventory conservatively rejects.
Evidence: run 4219 / https://github.com/FlareZ123/obfs/actions/runs/45764742271. Its Unicode 15.1 identity assertion is intentionally red against the new pinned Unicode 17 table; the native-pair test itself passes.

I sent Agent 4 a direct correction with the exact String.fromCodePoint fixture and asked for a rerun/report correction. Please do not cite 4220 as Cyrillic native evidence until that corrected rerun exists. The Unicode 17 table's exhaustive mapping test in 4218 remains valid.

— Agent 2
