# Portable artifact receipt path and file-graph admission (23 November 2026)

## Status and scope

Implemented and committed on `main`. This work strengthens the **research receipt** for three frozen native/minified/candidate artifact arms. It does not add client runtime secrecy, anti-instrumentation, hostile-owner integrity, or any universal 2.5× performance guarantee.

The original receipt validated only straightforward POSIX-relative spelling, case-insensitive exact names, file bytes, and per-arm file enumeration. It did not apply the compiler's existing canonical path policy. A Linux path such as `NUL.mjs`, two names differing only by NFC normalization, or `assets/` and `ASSETS/` under distinct file paths could be described in a declared arm without failing the original admission check for their portable identity. These names can alias or become invalid after deployment on another host.

The receipt now uses `src/portable-paths.js` `safePath` and `registerFilePath` for both declared paths and discovered files. Rejections cover Windows device and short-name spellings, control characters, ill-formed Unicode, lower/upper case-equivalent aliases, canonical-equivalent Unicode, and file/directory overlaps. A directory with no descendant files is refused because a file-only receipt cannot preserve its existence, which may change filesystem-sensitive program behavior. No source-transform or emitted-runtime instruction was changed.

## Reproduction

Run `node --test test/artifact-receipt.test.js`, `npm run typecheck` and `npm run typecheck:external` under Node 22. The test suite checks positive exact three-arm byte receipts, mutation refusal, lockfile mutation, traversal, symlinks, missing arms, malformed paths, Unicode and directory aliases, and empty-directory refusal.

- Initial portable-path implementation commit: [`fbedfad`](https://github.com/FlareZ123/obfs/commit/fbedfad6631555243fc65274ce1c647c38d61dbf).
- Correction to the test's expected directory-alias message: [`78a858e`](https://github.com/FlareZ123/obfs/commit/78a858e0b7b3d1e84272d9255e638aa69affac6f). Focused Linux/Windows JSDoc and test [run 45098105036](https://github.com/FlareZ123/obfs/actions/runs/45098105036) **passed**.
- Empty-directory admission: [`af4ebea`](https://github.com/FlareZ123/obfs/commit/af4ebeab84c7afd4ff432dd65fb4edce6265d269). The first run [45098239348](https://github.com/FlareZ123/obfs/actions/runs/45098239348) correctly exposed two empty `assets` directories inadvertently created by the old positive fixture.
- Positive fixture correction: [`1623831`](https://github.com/FlareZ123/obfs/commit/16238315668b2e4d2587c9b435a6fb9059cc5d0f). Focused Linux/Windows [run 45098328770](https://github.com/FlareZ123/obfs/actions/runs/45098328770) **passed** its 10-case artifact receipt test and strict JSDoc gates at exact source `b89c83b29de79b2b00cdbcd6597730d61bdba9d7`, which includes concurrent later mainline work.

This is a scoped file-graph consistency check under cooperating, readable build roots. It is not a byte-atomic snapshot under concurrent external writers. The selected source pin does not validate every unrelated Node, Chromium or performance workload. The core implementation continues to rely on normal filesystem access and can be forged by an attacker controlling the artifact roots or benchmark host.

Node 22 filesystem API reference: https://nodejs.org/download/release/latest-jod/docs/api/fs.html

## Raw directory-entry byte follow-up

Text-mode `fs.readdir` can decode invalid filesystem filename bytes into the Unicode replacement character (U+FFFD), allowing two different raw names to look identical to a file-only recorder before hash admission. Node 22's documented `encoding:'buffer'` with `withFileTypes:true` exposes original directory-entry bytes. The receipt now rejects invalid UTF-8 bytes through the standard `node:buffer` `isUtf8` check before path conversion, matching the existing compiler source-tree preflight. Valid, deliberately spelled U+FFFD filenames remain supported.

The first raw-byte focused [run 45098704531](https://github.com/FlareZ123/obfs/actions/runs/45098704531) was red because the recursively visited child had retained a `Buffer` `Dirent.name` in `path.join`; that was corrected to use the verified UTF-8-decoded `filename` string in [commit 669debb](https://github.com/FlareZ123/obfs/commit/669debbb95eb4997a6ef76e5b539fbe77ce4e6bd). Two-OS focused [run 45098759151](https://github.com/FlareZ123/obfs/actions/runs/45098759151) then passed. The [final positive U+FFFD control](https://github.com/FlareZ123/obfs/commit/c93a436411883a05e8364f52b94c5020b0a180db) passed in [run 45099041227](https://github.com/FlareZ123/obfs/actions/runs/45099041227): Ubuntu **11/11 passed**, Windows **8 passed, 3 skipped** (raw filename/Unix symlink cases), zero failures, both JSDoc gates passed at exact `c93a436411883a05e8364f52b94c5020b0a180db`.

To guard external receipt clients, the existing separate, full three-file native/minified/COO [frozen-polyvariant receipt regression](../test/frozen-polyvariant-receipt.test.js) passed focused Ubuntu/Windows and strict JSDoc at exact `83d8303f5ecfcc682cec1125d5aaf710f70189ed` in [run 45098986162](https://github.com/FlareZ123/obfs/actions/runs/45098986162). This is a compatibility check of a deliberately reconstructable candidate, not a new secrecy or compute-budget finding.

Documentation: [Node.js v22 fs.readdir with raw Buffer directory entry names](https://nodejs.org/download/release/v22.18.0/docs/api/fs.html#fsreaddirpath-options-callback). The adversary and trust limitations from the initial report remain unchanged.


## 23 November subsequent portable Unicode positive control

A final same-source two-platform regression at source `2f89e401daf365bb85c172b287fd7ffd48fea364` additionally confirms valid accented `café.mjs`, CJK `snow-雪.mjs` and supplementary emoji `emoji-🔐.mjs` paths are accepted and the exact receipt verifies after the raw-byte preflight. [Focused Node/Linux+Windows run 45099484634](https://github.com/FlareZ123/obfs/actions/runs/45099484634) passed the now **12-case** test suite and both strict JSDoc gates. This closes the potential overblocking concern: valid UTF-8 supplementary sequences remain admissible while malformed raw filename bytes are refused. Scope remains cooperative build receipt correctness rather than obfuscation secrecy or hostile filesystem integrity.
