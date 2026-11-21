# Canonical Unicode pathname aliases in generated artifact inventories (21 November 2026)

## Motivation and scope

The compiler had a source-identity collision key of `filename.toLowerCase()`, designed to reject two case-distinct generated paths that can address one file on a default Windows volume. It still accepted a composed/decomposed Unicode pair such as `modules/caf\u00e9.js` and `modules/cafe\u0301.js`: their original UTF-8 bytes differ, their `String#toLowerCase()` results differ, and their Unicode NFC forms are equal.

Apple's [APFS FAQ](https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/APFS_Guide/FAQ/FAQ.html) documents that both case-sensitive and case-insensitive APFS variants perform normalization-insensitive lookup. A portable output manifest containing both names may therefore become ambiguous on an APFS-backed deployment even when it is distinct on a Linux or Windows source checkout. This is an externally documented platform property. The current project CI has no macOS/APFS filesystem runner, so this report does **not** claim a live APFS reproduction.

## Bounded preflight changes

Source-pinned candidate `8053a142d4764dade65411598cdc94cb05993294` on branch `agent4/canonical-path-safety-20261121` uses `filename.normalize('NFC').toLowerCase()` for conservative collision preflight in:

- `src/core.js` `obfuscateFiles`, across COO/SNO/SCO source groups;
- `src/sco.js` direct handler source filenames, explicit public allowlists, and declared private graph paths;
- `src/sno.js` direct `createSnoLauncher` manifest inputs, which can be called without `obfuscateFiles`.

This declines ambiguous inputs before writing protected output. It preserves source and output path spelling for valid single filenames, along with exact opaque asset bytes. It can newly reject two distinct Linux filenames that would be unsafe to publish as a portable generated group, matching the project's existing conservative case-fold refusal.

`test/unicode-canonical-path-collisions.test.js` has six checks: different raw UTF-8 path bytes with equivalent NFC forms, three-mode compiler refusal, SCO handler and publicPaths refusal, private/public path alias denial, SNO direct manifest refusal with a positive noncollision control, and unchanged binary-asset payloads for a noncolliding Unicode pair.

The new key is **not** a complete simulation of every filesystem's Unicode and case-fold behavior. APFS uses a native Unicode version and platform-specific case handling; JavaScript NFC plus lowercase is a partial conservative approximation. It may have both false declines and aliases not captured by this test. Further claims require actual deployment filesystem tests and normalization/casefold analysis.

## Validation status

Pinned [manual Node 22 Linux/Windows and Ubuntu Chromium run](https://github.com/FlareZ123/obfs/actions/workflows/manual-validation.yml) was dispatched from `agent4/canonical-path-safety-20261121` and is pending at report creation. Do not claim a green integrated result until the exact run and job conclusions are read. The preceding, separate UTF-8 source admission result is tracked in `im-results/utf8-source-admission-2026-11-21.md`.

This work is a build artifact identity/safety preflight. It does not improve code confidentiality, authenticated environment locking, resistance to a fully controlling SNO/COO attacker, or a universal protected-runtime 2.5× compute guarantee.


## Initial CI diagnostics and corrected fixture

The first pinned combined run [44937910645](https://github.com/FlareZ123/obfs/actions/runs/44937910645) did **not** pass. Its new SCO tests used binary `.js` assets, which trigger the repository's intentional `assertNoSourceMapDisclosure` preflight before the candidate's path alias condition. That is a **fixture contract error**, not evidence against NFC collision detection. Updated `test/unicode-canonical-path-collisions.test.js` to use permitted binary PNG assets for collision/positive assertions while retaining a separately typed `.js` script case for private-path policy; repair commit `4346f0cc6fd5d5f127a2274ddb6f9099b932ea94`. The Windows job also independently hit a WebAuthn CPU timer-resolution assertion already observed in [44937302595](https://github.com/FlareZ123/obfs/actions/runs/44937302595).

The later exact source with this corrected fixture and direct source-string fidelity checks is `4346f0cc6fd5d5f127a2274ddb6f9099b932ea94` on `agent4/source-fidelity-portability-20261121`, running independent full validation. No complete two-OS green claim follows from the initial failed run.
