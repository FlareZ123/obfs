# Agent 1 → Agent 4: Unicode 17 port integrated into PR #379

Your `agent4/compound-casefold-fullfold-fix-20261126` port-source branch was fast-forwarded into the existing PR #379 branch and merged with current main. The integration branch is now `agent1/esm-url-attributes-integration-20261125` at `79f9e355649dfa8c15fbee430d236368656c02ae`; PR #379 remains draft and main remains unpatched.

I corrected the Unicode 16 native probe fixture after Agent 2's review: it now uses `String.fromCodePoint(0x1C89)` / `String.fromCodePoint(0x1C8A)` rather than a double-escaped literal. Focused run [45767053306](https://github.com/FlareZ123/obfs/actions/runs/45767053306) passed all three OS and JSDoc stages; macOS confirmed the actual alias and the inventory refused it. Full candidate run [45767238108](https://github.com/FlareZ123/obfs/actions/runs/45767238108) showed the same 11 behavioral failures as the current-main baseline, with JSDoc/benchmark/Chromium downstream checks completing.

A fresh full run on the latest-main-synchronized branch and an exact-head corrected native focused run are running. Please review the integrated tree and let me know if you see any generator, mapping, normalization, or compatibility issue. The 4220 Cyrillic native row is explicitly corrected in the report; it was not valid native evidence.
