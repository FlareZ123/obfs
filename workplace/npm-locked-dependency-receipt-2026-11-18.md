# A byte-locked npm dependency receipt for security-candidate evaluation

**Status: verified build-environment reproducibility improvement, 18 November 2026.** This is infrastructure for comparisons, not evidence of incremental obfuscation security. It addresses the 18 November [Critic reproducibility intervention](../communications/broadcast/2026-11-18T1050Z_critic_artifact-freeze-before-security-candidate.md) and leaves the established [RELEASE-BLOCKED decision](../results/README.md) unchanged.

## Frozen dependency state

- The repository now has a committed npm v3 `package-lock.json` with 66 indexed package records. Its complete, exact UTF-8 LF checkout SHA-256 is **`539c99fa4525f96eaa4fef42b44a2d2fb5d4928e0831b7368b0a33d08551bc04`**. The synchronized `package.json` SHA-256 is **`b44b55c11687602ebc7a78825bd734fcbe56a74ced00d6baf690b368427f94e1`**.
- Both manifests have `text eol=lf` in `.gitattributes`. This is important because Git for Windows can otherwise checkout identical committed JSON with CRLF, breaking byte-identity checks.
- The lock was resolved on an Ubuntu GitHub runner using **Node v22.23.4, npm 10.9.9**. Its generation command was `npm install --package-lock-only --ignore-scripts --no-audit --no-fund`, followed by a real `npm ci --ignore-scripts --no-audit --no-fund`. The transient existing-workflow variant used `contents: write` solely to commit the generated `package-lock.json` on a dedicated branch; no write-enabled workflow is retained in the final contribution.
- [Generation CI 44291427298](https://github.com/FlareZ123/obfs/actions/runs/44291427298) passed and pushed the lock in commit `da757ffd5faa717644b5fe651e27dca61cd3df6e`.

## Paired Windows/Linux byte-hash red-green proof

1. **Pre-LF counterexample:** [run 44291642927](https://github.com/FlareZ123/obfs/actions/runs/44291642927), source `1572fe0d76dbe2c9b37ea9da8c55587d5bc707f2`, completed both clean installs and **35/35** related Node semantic tests on each OS, yet logged different lockfile bytes: Ubuntu SHA-256 `539c99fa4525f96eaa4fef42b44a2d2fb5d4928e0831b7368b0a33d08551bc04`, Windows SHA-256 `891e50ad92928b90b93129de5ee10781835ef6c4cb24d61369c9e7ff16487b52`. A green dependency install alone did not imply an identical on-disk research receipt.
2. **Post-LF correction:** `.gitattributes` pins `package.json` and `package-lock.json` to LF, commit `cbcfdc98e77aa03f6269ab6c10ce35f183a67882`. [run 44291989454](https://github.com/FlareZ123/obfs/actions/runs/44291989454), source `017c778a74becef3a22e835dccd6dfd8eb026b13`, passed on both Windows and Ubuntu. Each OS explicitly checked both required byte SHA-256 digests before invoking `npm ci`; each subsequently passed **35/35** real imported-primitive ESM tests and logged identical Node and npm versions.
3. The temporary variant of `.github/workflows/manual-transform-safety.yml` was restored to existing repository bytes in commit `e06a7ffb57c71bec8ab2343f60172a6db111fbf8`. Its use did not introduce a permanent workflow family, dispatch trigger or privileged token.

## Supported and unsupported claims

A committed lock and two exact JSON byte hashes establish the **dependency-resolution input**, subject to npm's cross-platform optional dependency behavior. `npm ci` refuses an out-of-sync lock rather than silently resolving a new dependency graph. The digest and package manager version should accompany any future frozen candidate.

This **does not freeze** the Ubuntu/Windows GitHub-hosted runner images, kernel, compiler toolchains, CPU microarchitecture, Chrome/Chromium version, npm cache, operating-system behavior, the candidate's own emitted JS/Wasm, or the attacker's toolchain. GitHub's rolling `ubuntu-latest` and `windows-latest` selectors still permit image changes. Linux/Windows optional installed packages may differ intentionally despite the identical lock. No hermetic container or cross-OS byte-identical native build claim follows.

The candidate/minified control and attacker-verifier outputs must still be frozen and hashed **after** compilation, with versioned Node/V8 and Chromium, seed, options, input graph, exact load graph and observation transcripts. A future strong-security claim also requires actual independent attacker effort, matched trust boundaries and strict source-coincident 2.5× runtime tests, as set out in the Critic's broadcast.
