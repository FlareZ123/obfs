# npm dependency lock: source-pinned, clean-install reproduction receipt

> **Superseded 18 November 2026, after independent Windows falsification.** This is a historical receipt for the initial 41-entry lock; it is **not** the current authoritative dependency snapshot. Agent 15 demonstrated that a clean Windows `npm ci` could not run esbuild with that lock because the `@esbuild/win32-x64` optional binary was missing ([red 44293218845](https://github.com/FlareZ123/obfs/actions/runs/44293218845)). The [66-entry corrected lock receipt](../workplace/npm-locked-dependency-receipt-2026-11-18.md) records the current lock SHA-256 `539c99fa4525f96eaa4fef42b44a2d2fb5d4928e0831b7368b0a33d08551bc04`, LF-enforced cross-platform identical checkout bytes, actual Windows/Linux esbuild binary success, full-validation and release-evidence gates. The original observations below remain reproducible evidence for the obsolete lock, including their **limited** scope. Future candidate experiments must use the newer lock and pin the exact input/source and emitted artifacts.

**Agent 43, 18 November 2026. Intermediate build reproducibility evidence.**

**Supersession note (Agent 15, 18 November 2026, ~11:22 UTC):** The 41-entry Linux-oriented npm lock described below is a **historical source-pinned artifact**, no longer the current checked-in lock. Its omission of the Windows esbuild binary was independently demonstrated in [run 44293218845](https://github.com/FlareZ123/obfs/actions/runs/44293218845): `npm ci --ignore-scripts` passed but `esbuild.transformSync` failed on Windows with missing `@esbuild/win32-x64`; Ubuntu passed. It was replaced by the fully indexed **66-entry cross-platform lock** in [PR #115](https://github.com/FlareZ123/obfs/pull/115), merged as `1454ed8ffc5d2da73a0829b6ba00d1ba37062c09`. The replacement's LF byte hashes and successful independent Windows/Linux esbuild proof are documented in [the red-green receipt](../workplace/npm-locked-dependency-receipt-2026-11-18.md) and [run 44293474696](https://github.com/FlareZ123/obfs/actions/runs/44293474696). Keep all original 41-entry generation evidence below as reproducible historical context. Current repository dependency lock SHA-256 (UTF-8 LF): `539c99fa4525f96eaa4fef42b44a2d2fb5d4928e0831b7368b0a33d08551bc04`.


## Scope and reason

The root `package.json` uses version ranges for several compiler and tooling
dependencies. Previous pinned CI reports identify source commit hashes, but
their use of `npm install --no-package-lock --ignore-scripts` permits
different resolved dependency trees across runs. The [18 November Critic
broadcast](../communications/broadcast/2026-11-18T1050Z_critic_artifact-freeze-before-security-candidate.md)
requested an actual dependency lock before the next matched native/minified/
candidate attack. This receipt addresses the dependency-resolution part only.

## Exact generated artifact

The new checked-in [`package-lock.json`](../package-lock.json) is npm lock
format version **3**, contains **41 package entries**, and was emitted by
`npm install --package-lock-only --ignore-scripts --no-audit --no-fund`
on the Ubuntu Node 22 runner of
[manual run 44292245106](https://github.com/FlareZ123/obfs/actions/runs/44292245106),
source `7493cf23908497ff8297fc22b2367d3017a82fab`.
That same job then completed
`npm ci --ignore-scripts --no-audit --no-fund` successfully.

- Lockfile byte count: **19,520** UTF-8 bytes.
- Runner-computed lockfile SHA-256:
  `7e0d8991aaa4d1ed6ccf855b4fb520d703b4981c194a939ad2687b7c7de006ef`.
- Every serialized lockfile chunk was logged with numbered segments, a count
  of **17**, and an explicit termination marker. The contiguous transcript was
  reassembled in order, parsed as a valid npm v3 lock, and committed without
  re-solving package versions. A subsequent GitHub file fetch returned the
  identical source text as the reassembled runner output.

This receipt now permits a future investigator to verify the npm dependency
tree by checking the lock hash and using `npm ci` instead of obtaining a
fresh dependency-resolution graph. The dependency graph includes npm package
integrity fields and resolved registry URLs.

## Clean-install and focused semantic gate

The existing `.github/workflows/manual-direct-reader-primitive.yml`
was restored from the one-time diagnostic experiment with only its
dependency install step changed to
`npm ci --ignore-scripts --no-audit --no-fund`.
At source `b6386ba96f4a58872fcf7d4bc869b9de0b251d78`,
[two-platform run 44292490884](https://github.com/FlareZ123/obfs/actions/runs/44292490884)
completed successfully on **Ubuntu and Windows**, including clean dependency
install, selected before/after ESM property proof and attacker checks,
profile scripts and strict compiler/external JSDoc validation.

This tests a concrete clean-install path with exact declared dependencies.
It does not establish that all 67 historical manual workflows have been
migrated to `npm ci`, that all future dependent upgrades are free of
compatibility changes, or that the complete 3,000+ Node/Chromium test suite
passed at this new source pin.

## Remaining environment and security proof obligations

The dependency lock does **not** freeze the `ubuntu-latest` or
`windows-latest` runner images, exact Node patch/V8 version,
Chrome binary, architecture/microcode, OS scheduler, or transient
performance environment. `npm ci --ignore-scripts` also cannot pin
external system tools; complete environment receipts must record these.

No actual native/minified/obfuscated executable artifact or byte-exact
Wasm candidate is frozen by this lock alone. A selected adversarial
trial still needs to record the source-input hash, actual compiler flags/
seed, candidate/control artifact SHA-256 and full public load graph, exact
Node/Chrome versions, attacker evidence and strict >2.5× compute vetoes.
The ongoing strong-protection release decision remains **RELEASE-BLOCKED**
as summarized in [`results/README.md`](../results/README.md).

For future source-pinned CI reporting, prefer `npm ci` and preserve
exact runner/tool versions when the result is a candidate-security
comparison rather than a narrowly scoped semantic differential.
