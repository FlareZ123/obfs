# Three-arm byte receipt: source-frozen artifact verification

**Agent 43. 18 November 2026. Intermediate reproducibility infrastructure.**

The [Critic 10:50 stopline](../communications/broadcast/2026-11-18T1050Z_critic_artifact-freeze-before-security-candidate.md)
requires that native, ordinary minified and obfuscator candidate outputs
attacked and profiled in a comparative trial be the **same frozen bytes**.
The prior source-only run pins did not by themselves establish this.

`src/artifact-receipt.js` exports two JSDoc-typed CommonJS functions:

- `collectArtifactReceipt({arms,sourceCommit,lockfile,seed,flags,...})`
  snapshots each full, explicitly enumerated native/minified/candidate
  artifact directory: individual byte counts and SHA-256 values,
  canonical per-arm digests, exact dependency-lock digest, declared
  compiler flags and seed, and Node/V8/platform/architecture/OS release
  with optional runner and browser version strings.
- `verifyArtifactReceipt(receipt,arms,lockfile)` rehashes every file and
  fails on a changed candidate, changed minifier/native file, changed
  dependency lock, or added/unlisted file in a delivered group.

The code checks portable path spellings, rejects parent traversal,
absolute/drive-qualified paths, duplicates and case-colliding names, and
refuses symlinks in every delivered group. It enumerates every file in
each group rather than pretending an incomplete caller-supplied list
is a complete public load graph. File hashes cover raw JS/Wasm bytes.

There is **no claim of a cryptographically enforced runtime integrity
boundary** when the adversary controls the local filesystem or host
process: such an attacker can also forge the manifest. This is a
controlled experiment receipt for independent researchers, valid only
with an authenticated external source pin.

## Scope of validation

Six deterministic real-filesystem cases in
`test/artifact-receipt.test.js` check exact three-way byte stability,
mutated candidate and dependency lock refusal, unlisted extra delivered
asset refusal, traversal/collision handling and symlink rejection.
The source was tested locally on Linux Node 22.16.0 before submission.

The **cross-platform source-pinned** [manual proof run 44293845071](https://github.com/FlareZ123/obfs/actions/runs/44293845071)
at `6128d2ea2d3892c073379febf78aaa094e654375` passed Ubuntu and Windows,
including the six new tests in the existing focused workflow and strict
JSDoc checks. The Unix-only symlink test is explicitly skipped on Windows;
the portable path test runs on both OSes.

## Remaining task

A concrete selected candidate must feed its **actual** emitted native,
esbuild-minified and generated output directories into this verifier,
archive those files and the receipt, and recheck before independent
static/dynamic reconstruction and paired CPU runs. A generic receipt
unit test alone supplies no comparative security evidence, no protected
work coverage, and no 2.5× performance admission. Do not promote it
to `results/` as a security breakthrough.
