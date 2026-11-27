# Native filesystem case-fold probe: macOS Greek-theta alias

**Status:** Reproduced platform-specific path alias; candidate fix and focused cross-platform regression checks pass. Full manual-validation suite for the amended candidate is pending.

## Finding

The existing `src/portable-paths.js` inventory used two NFC-normalized keys per name: JavaScript `toLowerCase()` and `toUpperCase()`. That misses one single-code-point Unicode default-casefold equivalence:

- U+03D1 GREEK THETA SYMBOL: `ϑ`
- U+03F4 GREEK CAPITAL THETA SYMBOL: `ϴ`

Both full-casefold to U+03B8 (`θ`), while their direct lowercase and uppercase mappings differ. Node 22.23.4 confirms:
- `ϑ`: lower `ϑ`, upper `Θ`, upper-then-lower `θ`
- `ϴ`: lower `θ`, upper `ϴ`, upper-then-lower `θ`

The original inventory accepted both names.

## Native filesystem evidence

A focused Node 22.23.4 probe created each candidate pair in a fresh temporary directory, wrote different contents to each name, inspected `readdir`, read both spellings, and compared the result with `createPathInventory()/registerFilePath()`.

- Diagnostic run [4190 / 45756444120](https://github.com/FlareZ123/obfs/actions/runs/45756444120), on the pre-fix tree:
  - Ubuntu: no unprotected alias was reported.
  - Windows: no unprotected alias was reported.
  - macOS: **failed as intended**. Writing `ϑ.txt` then `ϴ.txt` left one directory entry, `ϑ.txt`; both spellings resolved to that same file, while the portable inventory accepted the pair.
  - The failing row was `filesystemAliases: true`, `portableInventoryRejects: false`.
- The same probe confirmed that the current inventory already rejects the tested ASCII case-only, Greek sigma/final-sigma, long-s, NFC/NFD, and sharp-s pairs when the runner filesystem aliases them. Dotless-I was distinct on the macOS runner but is conservatively rejected by the inventory.

This is an observed macOS runner filesystem collision, not merely a Unicode-theory conjecture. The probe does not establish behavior on every macOS release, volume format, locale, or filesystem.

## Bounded Unicode mapping audit

A reproducible Python `unicodedata` 15.1.0 enumeration over all Unicode scalar values grouped single-code-point strings by NFC-normalized default `.casefold()` output and compared the current lower-or-upper key union with an additional upper-then-lower key:

| Measure | Count |
|---|---:|
| Single-code-point casefold-equivalent pairs | 2,645 |
| Pairs collapsed by current lower-or-upper keys | 2,644 |
| Pairs collapsed after adding upper-then-lower | 2,645 |
| Additional false-positive pairs from the new key, relative to current keys, in this scalar-only comparison | 0 |

The only missed pair was U+03D1/U+03F4. This is a bounded scalar-value analysis using Python Unicode 15.1.0; it is not an exhaustive proof for multi-code-point strings or actual filesystem algorithms. The macOS probe independently confirms the specific collision on the runner.

## Candidate correction

On the existing PR #379 integration branch `agent1/esm-url-attributes-integration-20261125`:

- `src/portable-paths.js` now retains three prefixed keys: NFC lower, NFC upper, and NFC upper-then-lower.
- The JSDoc tuple types were expanded from two keys to three.
- `test/portable-path-tree.test.js` adds the Greek-theta alias as both an ancestor-directory and filename collision, exercises COO/SNO/SCO and direct SNO/SCO surfaces, and retains a positive distinct-sibling control.
- `test/portable-fs-casefold-probe.test.js` preserves the native filesystem probe as a regression test.
- `.github/workflows/manual-validation.yml` adds `macos-latest` to the focused-test matrix only. The full-suite matrix remains Ubuntu/Windows.

Focused verification:
- [Run 4191 / 45756664925](https://github.com/FlareZ123/obfs/actions/runs/45756664925): `test/portable-path-tree.test.js` passed on Ubuntu, Windows, and macOS; project/external/specialized JSDoc steps passed.
- [Run 4192 / 45756826661](https://github.com/FlareZ123/obfs/actions/runs/45756826661): `test/portable-fs-casefold-probe.test.js` passed on Ubuntu, Windows, and macOS; all focused JSDoc steps passed. The test asserts that any native filesystem alias must also be refused by the portable inventory.

The amended candidate still needs a fresh full manual-validation run. The previous full run [4188 / 45754177936](https://github.com/FlareZ123/obfs/actions/runs/45754177936) was on the pre-Greek-theta tree and had the same 11 rewrite-yield failures as baseline; it does not validate this new patch.

## Interpretation and remaining limits

This is a real cross-platform path-integrity correction. It does not establish complete Unicode filesystem equivalence, a universal case-fold model, source confidentiality, resistance to static or dynamic deobfuscation, hostile-runtime integrity, anti-relay, or universal 2.5× compliance. Keep PR #379 draft and the repository-wide release decision blocked until the full gate and broader security objectives are independently satisfied.
