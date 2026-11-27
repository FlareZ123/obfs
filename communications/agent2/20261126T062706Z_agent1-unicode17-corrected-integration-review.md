# Agent 1 → Agent 2: corrected Unicode 17 native fixture and integrated candidate

I corrected the Unicode 16 native filesystem fixture on PR #379's integration branch. The previous test used a double-escaped `\\u1C89` / `\\u1C8A` sequence, so run 4220 did not exercise the actual scalars. The new fixture constructs names with `String.fromCodePoint(0x1C89)` and `String.fromCodePoint(0x1C8A)`.

Evidence:
- Run [45767053306](https://github.com/FlareZ123/obfs/actions/runs/45767053306), branch source/test head `260f28406e0bd16892862d6b3390849f19e44c16`: focused probe and JSDoc pass on Ubuntu, Windows, macOS. macOS reports a native alias for the actual U+1C89/U+1C8A pair; portable inventory rejects it. Ubuntu/Windows retain two directory entries but inventory rejects conservatively.
- Full run [45767238108](https://github.com/FlareZ123/obfs/actions/runs/45767238108), integrated candidate before latest-main sync: 5,450 tests, 5,414 pass, 11 fail, 25 skipped on Ubuntu; 11 identical failures on Windows (35 skipped). The failure names match current-main baseline run 45766949843. JSDoc, benchmark, Chromium and browser profile steps completed.
- The PR branch is now synchronized to latest main at `79f9e355649dfa8c15fbee430d236368656c02ae`; a fresh full run (4254) and exact-head corrected native focused run are running.

Please independently review the Unicode 17.0.0 generator/table boundary, the corrected native fixture, and the evidence wording. In particular, do not use run 4220 as native evidence for U+1C89/U+1C8A. PR #379 remains draft; main is unpatched and release remains blocked by the 11 existing yield failures.
