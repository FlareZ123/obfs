# SNO input/output package-scope parity and conservative build refusal

**22 November 2026. Classification: source-pinned packaging compatibility
finding.** This report does not establish an obfuscation-security result
or remove the repository's RELEASE-BLOCKED decision.

## Mechanism and reproducible counterexample

Node 22 determines the module format of a `.js` file using its nearest
`package.json`, searching ancestors until the volume root or a
`node_modules` boundary. The `.cjs` and `.mjs` extensions specify their
format independently. See the [official Node 22 package rules](https://nodejs.org/download/release/latest-jod/docs/api/packages.html).

The compiler initially classified `.js` using metadata **inside** its
declared input group. An emitted CommonJS `entry.js` could inherit
`{"type":"module"}` from a parent of the output root, changing the runtime
format even when the source and SHA-256 manifest bytes were identical.
A local Node 22.16.0 independent reproduction used `source/entry.js`
containing `module.exports=23;`; the original CommonJS `require()`
returned 23. The exact same text placed under
`host/package.json` with `{"type":"module"}` failed with
`ReferenceError: module is not defined`.

The reverse mismatch is also real: an original input tree can inherit
an external ESM package without the compiler seeing that file. An
untracked `package.json` inside a reused output tree can override a
packaged scope on either side, including a stale CommonJS package
inside an intended ESM tree. A Node 22.16.0 local control confirmed that
an external `{"type":null}` and non-object JSON package metadata cause
`ERR_INVALID_PACKAGE_CONFIG`; treating these as ordinary CommonJS
metadata would silently change a native failure into a successful build.

## Implementation boundary

`src/cli.js` now calls `assertSnoPackageScope` against the input source
before compiling SNO. During output publication, the same check runs
under the existing cooperating directory lock, after output-path
preflight and before any emitted file is written.

The check compares each `.js` source type against any **non-emitted**
package metadata on the effective filesystem path. It resolves the
nearest existing real ancestor of the root, examines nested directories
for pre-existing metadata, respects the `node_modules` boundary,
and stops at a `package.json` the current build will itself emit.
An external ESM/CommonJS mismatch or invalid package shape/type causes
an explicit refusal. The check does not add hidden package files or
rewrite application source, which could expose unapproved metadata
to source readers.

The scope check is intentionally confined to the **CLI build location**.
The pathless programmatic `createSnoLauncher(files,entry)` cannot
perform deployment-directory admission. This is a static preflight
for cooperative build environments, with no claim of defeating an
uncooperative writer, loader interceptor or filesystem owner.

## Executable regression matrix

`test/sno-ambient-package-scope.test.js` contains 15 focused
cross-platform Node tests. The negative paths assert build rejection
before any protected source is published; positive paths execute the
actual generated SNO entry in a separate Node process.

| Class | Cases and expected result |
| --- | --- |
| External output ESM | Unscoped CommonJS `.js` refuses; explicit root and nested CommonJS packages succeed; `.cjs`-only output succeeds |
| Node boundary | `.js` under `node_modules` ignores the outside ESM ancestor; symlinked output resolves its real neutral destination and succeeds |
| Multi-file graph | A `.cjs` launcher with an unscoped CommonJS `.js` dependency under external ESM refuses |
| Reused output | Stale nested ESM overrides unscoped CommonJS and refuses; stale nested CommonJS consistent with source succeeds; stale nested CommonJS overriding an emitted ESM package refuses |
| Input environment | Unscoped source `.js` under an external ESM package refuses; the external CommonJS equivalent is admitted and executes with native parity |
| Invalid packages | External output `{"type":null}` and external input non-object metadata both refuse |
| Byte identity | Matched seeded outputs under no external package and an external CommonJS package are byte-for-byte identical, including `entry.js` and `sno-entry.cjs`, and both run with result 97 |

## Validation and source pins

The [15-case focused gate 45024087840](https://github.com/FlareZ123/obfs/actions/runs/45024087840),
source `bf420229bb4e56fd926587f8083e55813a1a0987`,
passed on **Ubuntu and Windows Node 22.23.4**, including both strict
project and external JSDoc typecheck gates. Its executable implementation
is pinned from `dd465a0870599383ea637a7030a6366943473bd8`;
the later test commit adds only the matched emitted-byte control.

The earlier [14-case focused run 45023994969](https://github.com/FlareZ123/obfs/actions/runs/45023994969)
also passed on both operating systems at `dd465a0870599383ea637a7030a6366943473bd8`.
The [full integration run 45022860316](https://github.com/FlareZ123/obfs/actions/runs/45022860316)
passed Ubuntu and Windows at older source
`838a48462d563ac8a1e6168e9a4b31ee87ab00dc`.
That full run predates the refined nested/input package checks and
must **not** be used as their integration sign-off. Exact later
full-matrix results, if any, must be documented separately.

## Constraints and release meaning

The proof envelope is a finite build-time test suite, not a general
theorem for arbitrary JavaScript. External package metadata can still
change after the check, and a distribution can be relocated to a
different package tree. Build into a clean directory and revalidate
the final deployment location. The compiler accepts some deliberately
unsupported source/dependency forms only under separate integration
contracts; this package check does not replace those contracts.

The admitted output-byte control supports **zero emitted-source delta
for the selected compatible pair**. The preflight executes only while
building and does not add runtime operations; the 2.5× repeated
execution budget is unchanged by this check in that pair. No new
general overhead bound, source secrecy advantage, tamper resistance,
or adversarial cost advantage was demonstrated.

The existing SNO filesystem-owner and in-memory loader attacks remain
effective under the declared threat model. The strong-protection
release decision remains **RELEASE-BLOCKED**.
