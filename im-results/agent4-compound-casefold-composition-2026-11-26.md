# Compound Unicode case-fold composition aliases on macOS

**Status:** A native macOS filename alias escaped the three-key portable-path inventory in the current PR #379 candidate. An isolated full-case-fold correction passes focused native, tree, and unit tests on Ubuntu, Windows, and macOS. The complete manual-validation gate is pending.

## Reproduction

The candidate's `portableKeys` used three independent whole-string keys: NFC lowercase, NFC uppercase, and NFC upper-then-lower. A bounded Unicode 15.1 scalar-pair audit had found 2,645 single-code-point default-casefold pairs, all sharing at least one of those keys. That result did not cover concatenations whose positions require different keys.

The compound filenames below are equivalent under Unicode 15.1 default full case folding:

- A: `ßϑ.txt` (U+00DF, U+03D1)
- B: `ẞϴ.txt` (U+1E9E, U+03F4)
- Both NFC full-fold to `ssθ.txt`.

But the candidate's three keys for the stem were:

| Key | A | B | Equal |
| --- | --- | --- | --- |
| NFC lowercase | `ßϑ` | `ßθ` | no |
| NFC uppercase | `SSΘ` | `ẞϴ` | no |
| NFC upper-then-lower | `ssθ` | `ßθ` | no |

The isolated test-only branch `agent4/compound-casefold-native-probe-20261126` reproduced a real alias on the GitHub macOS runner (Node v22.23.4, Unicode 17.0): the filesystem returned only `ßϑ.txt` after both names were written, and both spellings read the same entry. The portable inventory accepted both names. The focused native probe therefore failed on macOS, while Ubuntu and Windows did not alias the pair.

- Red reproduction: [manual-validation run 4196](https://github.com/FlareZ123/obfs/actions/runs/45759382638), test-only head `b72f32ea7758bddef68541c36c62123c812053cb).
- Repeated with a negative control: [run 4197](https://github.com/FlareZ123/obfs/actions/runs/45759699820), test-only head `496b28df7b68a10573b4eb019e39bb3ff035753f).

## Why the simple composite heuristic was rejected

A fourth `NFC(lower→upper→lower)` key catches the observed alias, but it also collapses `ıß` and `iẞ`. Unicode default full case folding keeps these distinct (`ıss` versus `iss`), and the macOS runner stored both filenames as distinct entries. The original three keys also kept this control distinct. The second native probe recorded `candidateCompositeKeyRejects:true` while `filesystemAliases:false`.

This is an observed extra false positive, not just a theoretical concern. The fix therefore uses a full-fold key rather than the broad composite heuristic.

## Isolated correction

Branch: `agent4/compound-casefold-fullfold-fix-20261126`

Candidate head: `c248d52aeeeecf1e35b5a90f01696ca3ef10b2a3`

The correction preserves the three existing conservative keys and adds a fourth key based on Unicode 15.1 default full case folding, applied to the complete NFC-normalized string. The generated override table records the 297 scalars for which full default folding differs from per-code-point lowercase; other scalars use per-code-point lowercase. Turkic-only mappings are excluded. NFC is applied before and after folding.

Reproduction/generation artifacts:

- `src/unicode-casefold.js`
- `src/unicode-casefold-overrides.js`
- `sims/generate-unicode-casefold-overrides.py`
- `test/unicode-casefold.test.js`
- `test/portable-path-tree.test.js`
- `test/portable-fs-casefold-probe.test.js`

Focused validation on the correction branch:

| Run | Scope | Result |
| --- | --- | --- |
| [4199](https://github.com/FlareZ123/obfs/actions/runs/45760247426) | Native filesystem probe, including both compound witness and non-fold-equivalent control | Pass on Ubuntu, Windows, macOS; all JSDoc steps pass |
| [4200](https://github.com/FlareZ123/obfs/actions/runs/45760347205) | Cross-mode output-tree regression | Pass on Ubuntu, Windows, macOS; all JSDoc steps pass |
| [4201](https://github.com/FlareZ123/obfs/actions/runs/45760479383) | Unicode full-fold unit tests | Pass on Ubuntu, Windows, macOS; all JSDoc steps pass |
| [4202](https://github.com/FlareZ123/obfs/actions/runs/45760599281) | Complete manual-validation workflow | Pending at report creation |

The native-probe green result shows that the new inventory rejects the compound pair on all three runner platforms and still accepts the non-fold-equivalent `ıß` / `iẞ` control on macOS. The tests exercise the shared path inventory through COO, SNO, and SCO packaging/admission paths.

## Limits and integration status

- This is one reproduced alias on the tested macOS GitHub runner, not proof about every APFS/HFS+ version, filesystem configuration, or Unicode revision.
- The table is pinned to Unicode 15.1.0 while the macOS Node runner reports Unicode 17.0. The tested mappings are present in 15.1.0; new Unicode mappings and future table updates remain a maintenance boundary.
- Keeping the existing three keys intentionally retains their known conservative refusals (including the dotless-I case). The full-fold key improves compound coverage but does not establish a universal filesystem-equivalence theorem.
- This is a path identity and safe-publication correctness result. It does not increase confidentiality, anti-debugging strength, tamper resistance, or satisfy the 2.5× runtime constraint.
- The correction branch is separate from PR #379 and is not integrated into `main` or the PR branch. Do not treat the focused receipts as release acceptance. PR #379 should remain draft until the integration owner ports the correction and a fresh full validation is reviewed.

Unicode source: [Unicode 15.1.0 CaseFolding.txt](https://www.unicode.org/Public/15.1.0/ucd/CaseFolding.txt), default full mappings (common/full; Turkic-specific mappings excluded).
