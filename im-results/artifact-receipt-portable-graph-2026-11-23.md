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
