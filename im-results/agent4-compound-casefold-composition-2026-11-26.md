# Compound Unicode case-fold composition aliases on macOS

**Status:** A native macOS filename alias escaped the three-key portable-path inventory in the current PR #379 candidate. A pinned Unicode 17.0.0 full-casefold correction now passes exhaustive table, native filesystem, and cross-mode path tests on Ubuntu, Windows, and macOS. Full manual validation of the final table is running; the repository remains release-blocked by 11 pre-existing property-renaming/yield failures.

## Reproduction

The PR candidate's portableKeys used three independent whole-string keys: NFC lowercase, NFC uppercase, and NFC upper-then-lower. A bounded Unicode 15.1 scalar-pair audit found 2,645 single-code-point default-casefold pairs, all sharing at least one of those keys. That did not cover concatenations whose positions require different keys.

The compound filenames below are equivalent under Unicode default full case folding (including Unicode 15.1 and 17.0):

- A: ßϑ.txt (U+00DF, U+03D1)
- B: ẞϴ.txt (U+1E9E, U+03F4)
- Both NFC full-fold to ssθ.txt.

But the candidate's three keys for the stem were:

| Key | A | B | Equal |
| --- | --- | --- | --- |
| NFC lowercase | ßϑ | ßθ | no |
| NFC uppercase | SSΘ | ẞϴ | no |
| NFC upper-then-lower | ssθ | ßθ | no |

The isolated test-only branch agent4/compound-casefold-native-probe-20261126 reproduced a real alias on the GitHub macOS runner (Node v22.23.4, Unicode 17.0): the filesystem returned only ßϑ.txt after both names were written, and both spellings read the same entry. The portable inventory accepted both names. Ubuntu and Windows did not alias the pair.

- Red reproduction: [run 4196](https://github.com/FlareZ123/obfs/actions/runs/45759382638), test-only head b72f32ea7758bddef68541c36c62123c812053cb.
- Repeated with a negative control: [run 4197](https://github.com/FlareZ123/obfs/actions/runs/45759699820), test-only head 496b28df7b68a10573b4eb019e39bb3ff035753f.

## Why the simple composite heuristic was rejected

A fourth NFC(lower→upper→lower) key catches the observed alias, but it also collapses ıß and iẞ. Unicode default full case folding keeps these distinct (ıss versus iss), and the macOS runner stored both filenames as distinct entries. The original three keys also kept this control distinct. The second native probe recorded candidateCompositeKeyRejects=true while filesystemAliases=false.

This is an observed extra false positive, not just a theoretical concern. The correction uses a full-fold key rather than the broad composite heuristic.

## Pinned Unicode 17 correction

Port-source branch: agent4/compound-casefold-fullfold-fix-20261126

Current head: 118e324802f0cbef4f7665554b4da9f3bab054b3

The correction preserves the three existing conservative keys and adds a fourth key using the complete Unicode 17.0.0 default full-casefold mapping table. The table contains 1,585 common/full (C/F) mappings; simple-only (S) and Turkic-only (T) mappings are excluded. Unlisted codepoints remain unchanged. There is no runtime lowercase fallback. BMP lookup keys are padded to four hexadecimal digits to match the UCD table representation.

The fold mapping is pinned to Unicode 17.0.0. NFC normalization before and after folding still uses the host Node runtime's Unicode normalization data; that remains a compatibility boundary for runtimes whose normalization data predates Unicode 17.0.0. The table is therefore deterministic, but the complete path-key pipeline is not wholly independent of the host runtime.

Reproduction/generation artifacts:

- src/portable-paths.js
- src/unicode-casefold.js
- src/unicode-casefold-data.js
- sims/generate-unicode-casefold-data.py (parses a local Unicode 17.0.0 CaseFolding.txt; validates version header and 1,585 C/F mappings)
- sims/audit-compound-casefold-witness.py (reproduces the original compound witness with Python Unicode 15.1)
- resources/unicode-casefold-data-source.md (source and license attribution)
- test/unicode-casefold.test.js
- test/portable-path-tree.test.js
- test/portable-fs-casefold-probe.test.js

The Unicode source is [Unicode 17.0.0 CaseFolding.txt](https://www.unicode.org/Public/17.0.0/ucd/CaseFolding.txt). The generator includes C/F mappings and excludes S/T mappings. Attribution and licensing are recorded in resources/unicode-casefold-data-source.md; the official [Unicode License V3](https://www.unicode.org/license.txt) provides the complete copyright and permission terms.

## Validation

| Run | Scope | Result |
| --- | --- | --- |
| [4199](https://github.com/FlareZ123/obfs/actions/runs/45760247426) | Initial native compound witness and negative control, Unicode 15.1 hybrid | Pass on Ubuntu, Windows, macOS |
| [4200](https://github.com/FlareZ123/obfs/actions/runs/45760347205) | Cross-mode output-tree regression, initial hybrid | Pass on all three OS |
| [4201](https://github.com/FlareZ123/obfs/actions/runs/45760479383) | Initial Unicode fold unit tests | Pass on all three OS |
| [4208](https://github.com/FlareZ123/obfs/actions/runs/45762696800) | Eight default-ignorable native controls | Pass on all three OS; no unprotected alias |
| [4211](https://github.com/FlareZ123/obfs/actions/runs/45762865689) | Accent/compatibility controls and fold-positive pairs | Pass on all three OS |
| [4212](https://github.com/FlareZ123/obfs/actions/runs/45762986175) | Unit policy for accent/compatibility distinctions | Pass on all three OS |
| [4215](https://github.com/FlareZ123/obfs/actions/runs/45763722686) | First Unicode 17 full-table unit attempt | Failed: BMP lookup omitted leading zeroes |
| [4218](https://github.com/FlareZ123/obfs/actions/runs/45764695789) | Exhaustive 1,585-entry Unicode 17 table test; includes Unicode 16 Cyrillic Tje U+1C89/U+1C8A | Pass on all three OS and all JSDoc steps |
| [4220](https://github.com/FlareZ123/obfs/actions/runs/45764798938) | Expanded native filesystem probe with Unicode 17 table, compound witness, default-ignorables, accents, compatibility, and Cyrillic Tje | Pass on all three OS and all JSDoc steps |
| [4223](https://github.com/FlareZ123/obfs/actions/runs/45764924463) | Full manual-validation workflow for the pinned Unicode 17 table | Red on the same 11 baseline failures; no new failures |

Run 4215 exposed the missing BMP key padding; the lookup now uses padStart(4,'0'), and run 4218 validates every table entry. The expanded native probe in run 4220 shows no unprotected alias for the listed default-ignorable, accent, compatibility, and Unicode 16 controls. These are bounded test pairs, not an exhaustive filesystem-equivalence proof.

## Limits and integration status

- This is one reproduced alias on the tested macOS GitHub runner, not proof about every APFS/HFS+ version, filesystem configuration, or Unicode revision.
- The Unicode 17.0 full-fold table is a conservative equivalence relation. Older filesystems may not implement every newer mapping, so some names may be refused even when a particular filesystem would keep them distinct.
- NFC normalization remains runtime-version-dependent. The three legacy keys also use runtime lower/upper mappings. The full-fold table improves deterministic coverage but does not establish a universal filesystem-equivalence theorem.
- Keeping the existing three keys intentionally retains their known conservative refusals (including the dotless-I case).
- This is a path identity and safe-publication correctness result. It does not increase confidentiality, anti-debugging strength, tamper resistance, or prove the 2.5× runtime constraint across all programs.
- The correction branch is a temporary port source for the sole integration path PR #379, not a separate PR or merge path. It is not integrated into main or the PR branch. Do not treat focused receipts as release acceptance. PR #379 should remain draft until the integration owner ports the correction and a fresh full validation is reviewed.

## Historical full-gate comparison

The earlier Unicode 15.1 hybrid full-gate run [4202](https://github.com/FlareZ123/obfs/actions/runs/45760599281) completed red on the exact same 11 baseline property-renaming/yield failures as baseline run 4150. It introduced no new failures, but it does not validate the current pinned Unicode 17 table. The current full gate [4223](https://github.com/FlareZ123/obfs/actions/runs/45764924463) completed red on the same 11 baseline property-renaming/yield failures as run 4150. Ubuntu: 5,442 tests, 5,406 passed, 11 failed, 25 skipped. Windows: 5,442 tests, 5,396 passed, 11 failed, 35 skipped. The 11 failing names and locations match baseline exactly; no new failure was introduced. Project/external JSDoc, affine/paired-budget typechecks, benchmarks, and all profile rows passed; all three Ubuntu Chromium checks passed. Windows Chromium checks were skipped after the behavioral suite failed. Reported performance ratios stayed within 2.5×. Run 4223 is not a green full gate and does not remove the repository's release blocker.
