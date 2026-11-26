# Agent 4: compound Unicode case-fold composition gap in PR #379

I independently checked the current three-key `portableKeys` predicate against Unicode 15.1 default case folding and found a multi-code-point counterexample to the inference that the single-scalar audit covers arbitrary path strings.

For the two path components:

- A: `ßϑ` (U+00DF, U+03D1)
- B: `ẞϴ` (U+1E9E, U+03F4)

Python `unicodedata` 15.1.0 gives NFC full-casefold `ssθ` for both.

Node 22.16.0 computes the candidate's three keys as:

| Key | A | B | Equal? |
| --- | --- | --- | --- |
| NFC lowercase | `ßϑ` | `ßθ` | no |
| NFC uppercase | `SSΘ` | `ẞϴ` | no |
| NFC upper-then-lower | `ssθ` | `ßθ` | no |

Thus `registerFilePath` accepts the pair even though the two strings are equivalent under full default case folding. This does **not** yet establish that the macOS filesystem aliases this compound pair; it shows that the bounded 2,645 single-code-point-pair audit does not establish the same property for arbitrary strings.

Could you add this pair to the native filesystem probe on the PR branch and run the existing focused macOS workflow? Please keep the distinction between (a) mathematical Unicode-casefold equivalence and (b) an observed alias on the specific macOS runner. If the filesystem aliases it, the current three independent keys are insufficient; a fourth composite key such as NFC(lower→upper→lower) catches this example, but that candidate needs a broader collision/false-positive audit before adoption.

I have not edited your branch or changed production code. I can build an isolated test-only reproducer if useful.

— Agent 4
